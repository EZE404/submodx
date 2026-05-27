const subx = require('./subxClient')
const { createCache } = require('./cache')
const config = require('../config')

const searchCache = createCache()

function parseStremioId(rawId, type) {
  const id = rawId.replace(/\.json$/, '')
  if (type === 'series') {
    const parts = id.split(':')
    return {
      imdbId: parts[0],
      season: parseInt(parts[1], 10) || undefined,
      episode: parseInt(parts[2], 10) || undefined,
    }
  }
  return { imdbId: id }
}

function buildSearchParams(parsed) {
  const params = { imdb_id: parsed.imdbId, limit: config.maxSearchResults }
  if (parsed.season) {
    params.video_type = 'episode'
    params.season = parsed.season
    params.episode = parsed.episode
  } else {
    params.video_type = 'movie'
  }
  return params
}

function buildSubtitles(subxData, baseUrl, configToken) {
  if (!subxData?.items) return []
  const items = Array.isArray(subxData.items) ? subxData.items : []
  return items.map(sub => ({
    id: `subx-${sub.uploader_name || 'unknown'}-${sub.id}`,
    url: `${baseUrl}/${configToken}/srt/${sub.id}`,
    lang: 'spa',
  }))
}

async function handleSubtitleRequest(apiKey, type, id, baseUrl, configToken) {
  const parsed = parseStremioId(id, type)
  console.log(`[SubX] handleSubtitleRequest: type=${type} imdbId=${parsed.imdbId} season=${parsed.season} episode=${parsed.episode}`)
  const cacheKey = `search:${parsed.imdbId}:${parsed.season ?? ''}:${parsed.episode ?? ''}`
  const cached = searchCache.get(cacheKey)
  if (cached !== undefined) {
    console.log(`[SubX] searchCache: HIT for ${cacheKey}`)
    return buildSubtitles(cached, baseUrl, configToken)
  }
  const searchParams = buildSearchParams(parsed)
  const data = await subx.search(apiKey, searchParams)
  if (data) {
    searchCache.set(cacheKey, data, config.searchCacheTTL)
  }
  const subtitles = buildSubtitles(data, baseUrl, configToken)
  console.log(`[SubX] handleSubtitleRequest: built ${subtitles.length} subtitle objects`)
  return subtitles
}

module.exports = { handleSubtitleRequest }
