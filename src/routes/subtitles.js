const { decryptApiKey } = require('../crypto')
const { handleSubtitleRequest } = require('../services/subtitleHandler')
const config = require('../config')
const logger = require('../services/logger')

async function subtitlesRoute(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', `max-age=${config.searchCacheTTL}`)

  logger.info('subtitlesRoute: request received')
  const apiKey = decryptApiKey(req.params.config)
  if (!apiKey) {
    logger.warn('subtitlesRoute: invalid config token, returning empty')
    return res.json({ subtitles: [] })
  }

  const wildcard = req.params[0] || ''
  const parts = wildcard.split('/')
  const type = parts[0]
  const id = (parts[1] || '').replace(/\.json$/, '')

  logger.debug({ type, id }, 'subtitlesRoute')
  if (!type || !id) {
    logger.warn('subtitlesRoute: missing type or id')
    return res.json({ subtitles: [] })
  }

  try {
    const subtitles = await handleSubtitleRequest(apiKey, type, id, config.baseUrl, req.params.config)
    logger.info({ count: subtitles.length }, 'subtitlesRoute: returning subtitles')
    res.json({ subtitles, cacheMaxAge: config.searchCacheTTL })
  } catch (err) {
    logger.error({ err }, 'subtitlesRoute: error')
    res.json({ subtitles: [] })
  }
}

module.exports = { subtitlesRoute }
