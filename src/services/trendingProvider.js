const logger = require('./logger')

const TMDB_BASE = 'https://api.themoviedb.org/3'

class TrendingProvider {
  #fetchErrors = 0

  constructor({ tmdbApiKey }) {
    this.headers = { Authorization: `Bearer ${tmdbApiKey}` }
  }

  get fetchErrors() {
    const count = this.#fetchErrors
    this.#fetchErrors = 0
    return count
  }

  async #fetch(endpoint) {
    try {
      const res = await fetch(`${TMDB_BASE}${endpoint}`, { headers: this.headers })
      if (!res.ok) {
        this.#fetchErrors++
        const body = await res.text()
        logger.error({ component: 'prefetch', status: res.status, endpoint, responseBody: body }, 'TMDB API error')
        return null
      }
      return res.json()
    } catch (err) {
      this.#fetchErrors++
      logger.error({ component: 'prefetch', err, endpoint }, 'TMDB fetch error')
      return null
    }
  }

  async fetchTrendingMovies(count = 10) {
    try {
      const data = await this.#fetch(`/trending/movie/week`)
      if (!data?.results) return []

      const results = []
      for (const r of data.results) {
        if (results.length >= count) break
        if (r.original_language === 'es') continue
        if (!r.release_date) continue

        const details = await this.#fetch(`/movie/${r.id}?append_to_response=release_dates`)
        if (!details?.imdb_id) {
          logger.warn({ component: 'prefetch', tmdbId: r.id, title: r.title || r.original_title || '' }, 'fetchTrendingMovies: no imdb_id')
          continue
        }

        const hasHomeRelease = (details.release_dates?.results || []).some(r =>
          (r.release_dates || []).some(rd => rd.type >= 4)
        )
        if (!hasHomeRelease) {
          logger.debug({ component: 'prefetch', tmdbId: r.id, title: r.title || r.original_title || '', imdbId: details.imdb_id }, 'fetchTrendingMovies: no home release yet, skipping')
          continue
        }

        results.push({ imdbId: details.imdb_id, title: r.title || r.original_title || '', type: 'movie' })
      }

      logger.debug({
        component: 'prefetch',
        count: results.length,
        movies: results.map(m => ({ imdbId: m.imdbId, title: m.title })),
      }, 'fetchTrendingMovies: resolved')
      return results
    } catch (err) {
      logger.error({ component: 'prefetch', err }, 'fetchTrendingMovies: unexpected error')
      return []
    }
  }

  async fetchTrendingTv(count = 10, episodesPerShow = 3) {
    try {
      const data = await this.#fetch(`/trending/tv/week`)
      if (!data?.results) return []

      const results = []
      for (const r of data.results) {
        if (results.length >= count) break
        if (r.original_language === 'es') continue
        if (!r.first_air_date) continue

        const details = await this.#fetch(`/tv/${r.id}?append_to_response=external_ids`)
        if (!details) continue

        const imdbId = details.external_ids?.imdb_id
        if (!imdbId) {
          logger.warn({ component: 'prefetch', tmdbId: r.id, title: r.name || r.original_name || '' }, 'fetchTrendingTv: no imdb_id')
          continue
        }

        if (!details.last_episode_to_air) {
          logger.warn({ component: 'prefetch', tmdbId: r.id, title: r.name || r.original_name || '', imdbId }, 'fetchTrendingTv: no episodes to prefetch')
          continue
        }

        const { season_number, episode_number } = details.last_episode_to_air
        const start = Math.max(1, episode_number - episodesPerShow + 1)
        for (let ep = episode_number; ep >= start; ep--) {
          results.push({
            imdbId,
            title: r.name || r.original_name || '',
            type: 'series',
            season: season_number,
            episode: ep,
          })
        }
      }

      logger.debug({
        component: 'prefetch',
        count: results.length,
        episodes: results.map(e => ({ imdbId: e.imdbId, title: e.title, season: e.season, episode: e.episode })),
      }, 'fetchTrendingTv: resolved')
      return results
    } catch (err) {
      logger.error({ component: 'prefetch', err }, 'fetchTrendingTv: unexpected error')
      return []
    }
  }
}

module.exports = { TrendingProvider }
