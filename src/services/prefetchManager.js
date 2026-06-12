const { TrendingProvider } = require('./trendingProvider')
const subx = require('./subxClient')
const { processDownload } = require('./subtitleProcessor')
const { getSearchCache } = require('../storage')
const config = require('../config')
const logger = require('./logger')
const metrics = require('./metrics')

const BUDGET_BUFFER = 5

class PrefetchManager {
  constructor(config) {
    this.tmdbApiKey = config.tmdbApiKey
    this.subxApiKey = config.subxPrefetchApiKey
    this.enabled = config.prefetchEnabled
    this.intervalMs = config.prefetchIntervalMinutes * 60 * 1000
    this.trendingCount = config.prefetchTrendingCount
    this.episodesPerShow = config.prefetchTvEpisodesPerSeason
    this.downloadsPerTitle = config.prefetchDownloadsPerTitle
    this.maxSearchResults = config.maxSearchResults
    this.timer = null
    this.running = false
    this.provider = new TrendingProvider({ tmdbApiKey: config.tmdbApiKey })
    this.subxBudget = { remaining: 60, resetAt: 0 }
  }

  start() {
    setTimeout(() => this.#runCycle(), 30_000)
    this.timer = setInterval(() => this.#runCycle(), this.intervalMs)
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async #runCycle() {
    if (this.running) {
      logger.warn({ component: 'prefetch' }, 'Prefetch cycle skipped — previous cycle still running')
      return
    }
    this.running = true
    const startTime = Date.now()

    const counters = { newCached: 0, skipped: 0, rateLimited: 0, tmdbErrors: 0, subxErrors: 0 }

    try {
      const [movies, tvEpisodes] = await Promise.all([
        this.provider.fetchTrendingMovies(this.trendingCount),
        this.provider.fetchTrendingTv(this.trendingCount, this.episodesPerShow),
      ])

      counters.tmdbErrors = this.provider.fetchErrors

      const allItems = [
        ...movies.map(m => ({ ...m, _type: 'movie' })),
        ...tvEpisodes.map(e => ({ ...e, _type: 'episode' })),
      ]

      for (const item of allItems) {
        if (item._type === 'movie') {
          await this.#prefetchMovie(item, counters)
        } else {
          await this.#prefetchEpisode(item, counters)
        }
      }
    } catch (err) {
      logger.error({ err, component: 'prefetch' }, 'Prefetch cycle error')
    }

    const durationMs = Date.now() - startTime
    const totalItems = this.trendingCount + this.trendingCount * this.episodesPerShow

    logger.info({
      component: 'prefetch',
      moviesFetched: this.trendingCount,
      tvShowsFetched: this.trendingCount,
      episodesFetched: this.trendingCount * this.episodesPerShow,
      downloadsPerTitle: this.downloadsPerTitle,
      newCached: counters.newCached,
      alreadyCached: counters.skipped,
      rateLimited: counters.rateLimited,
      tmdbErrors: counters.tmdbErrors,
      subxErrors: counters.subxErrors,
      durationMs,
    }, 'Prefetch cycle complete')

    metrics.prefetchCycleDuration.set(durationMs / 1000)
    metrics.prefetchCycleItems.labels('new').set(counters.newCached)
    metrics.prefetchCycleItems.labels('skipped').set(counters.skipped)
    metrics.prefetchCycleItems.labels('total').set(totalItems)

    this.running = false
  }

  async #prefetchMovie(item, counters) {
    const cacheKey = `${item.imdbId}::`
    const searchCache = getSearchCache()
    const cached = await searchCache.get(cacheKey)
    if (cached !== undefined) {
      counters.skipped++
      logger.debug({ component: 'prefetch', imdbId: item.imdbId, title: item.title }, 'Prefetch skip — search cache hit')
      metrics.prefetchItemsTotal.labels('skipped').inc()
      return
    }

    const data = await this.#callSubxSearch(item.imdbId, {
      imdb_id: item.imdbId,
      video_type: 'movie',
      limit: this.maxSearchResults,
    })
    if (!data) {
      counters.subxErrors++
      metrics.prefetchItemsTotal.labels('error').inc()
      return
    }
    if (data.rateLimited) {
      counters.rateLimited++
      metrics.prefetchItemsTotal.labels('rate_limited').inc()
      return
    }

    await searchCache.set(cacheKey, data, config.searchCacheTTL)

    const items = Array.isArray(data.items) ? data.items : []
    const selected = items.slice(0, this.downloadsPerTitle)

    for (const sub of selected) {
      await this.#waitForSubxBudget()
      const downloaded = await processDownload(this.subxApiKey, sub.id)
      if (downloaded) {
        counters.newCached++
        metrics.prefetchItemsTotal.labels('cached').inc()
      } else {
        counters.subxErrors++
        metrics.prefetchItemsTotal.labels('error').inc()
      }
    }
  }

  async #prefetchEpisode(item, counters) {
    const cacheKey = `${item.imdbId}:${item.season}:${item.episode}`
    const searchCache = getSearchCache()
    const cached = await searchCache.get(cacheKey)
    if (cached !== undefined) {
      counters.skipped++
      logger.debug({ component: 'prefetch', imdbId: item.imdbId, season: item.season, episode: item.episode }, 'Prefetch skip — search cache hit')
      metrics.prefetchItemsTotal.labels('skipped').inc()
      return
    }

    const data = await this.#callSubxSearch(item.imdbId, {
      imdb_id: item.imdbId,
      video_type: 'episode',
      season: item.season,
      episode: item.episode,
      limit: this.maxSearchResults,
    })
    if (!data) {
      counters.subxErrors++
      metrics.prefetchItemsTotal.labels('error').inc()
      return
    }
    if (data.rateLimited) {
      counters.rateLimited++
      metrics.prefetchItemsTotal.labels('rate_limited').inc()
      return
    }

    await searchCache.set(cacheKey, data, config.searchCacheTTL)

    const items = Array.isArray(data.items) ? data.items : []
    const selected = items.slice(0, this.downloadsPerTitle)

    for (const sub of selected) {
      await this.#waitForSubxBudget()
      const downloaded = await processDownload(this.subxApiKey, sub.id)
      if (downloaded) {
        counters.newCached++
        metrics.prefetchItemsTotal.labels('cached').inc()
      } else {
        counters.subxErrors++
        metrics.prefetchItemsTotal.labels('error').inc()
      }
    }
  }

  async #waitForSubxBudget() {
    if (this.subxBudget.remaining <= BUDGET_BUFFER) {
      const waitMs = Math.max(0, this.subxBudget.resetAt - Date.now()) + 1000
      logger.debug({ component: 'prefetch', waitMs, remaining: this.subxBudget.remaining }, 'Waiting for SubX budget')
      await new Promise(r => setTimeout(r, waitMs))
      this.subxBudget.remaining = 60
    }
  }

  async #callSubxSearch(imdbId, params) {
    await this.#waitForSubxBudget()
    const data = await subx.search(this.subxApiKey, params)
    if (data?.rateLimited) {
      const retryAfter = data.retryAfter || 60
      logger.warn({ component: 'prefetch', retryAfter, imdbId }, 'SubX search rate limited, retrying')
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      const retryData = await subx.search(this.subxApiKey, params)
      if (retryData?.rateLimited) {
        logger.warn({ component: 'prefetch', imdbId }, 'SubX search rate limited again, skipping')
        return { rateLimited: true }
      }
      if (!retryData) return null
      this.#updateBudget()
      return retryData
    }
    if (!data) return null
    this.#updateBudget()
    return data
  }

  #updateBudget() {
    this.subxBudget.remaining = Math.max(0, this.subxBudget.remaining - 1)
    if (this.subxBudget.resetAt === 0) {
      this.subxBudget.resetAt = Date.now() + 60000
    }
  }
}

module.exports = { PrefetchManager }
