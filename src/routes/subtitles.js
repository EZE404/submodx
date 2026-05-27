const { decryptApiKey } = require('../crypto')
const { handleSubtitleRequest } = require('../services/subtitleHandler')
const config = require('../config')

async function subtitlesRoute(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', `max-age=${config.searchCacheTTL}`)

  console.log(`[SubX] subtitlesRoute: config=${req.params.config}`)
  const apiKey = decryptApiKey(req.params.config)
  if (!apiKey) {
    console.log(`[SubX] subtitlesRoute: invalid config token, returning empty`)
    return res.json({ subtitles: [] })
  }

  console.log(`[SubX] subtitlesRoute: req.params=${JSON.stringify(req.params)}`)
  const wildcard = req.params[0] || ''
  const parts = wildcard.split('/')
  const type = parts[0]
  const id = (parts[1] || '').replace(/\.json$/, '')

  console.log(`[SubX] subtitlesRoute: type=${type} id=${id}`)
  if (!type || !id) {
    console.log(`[SubX] subtitlesRoute: missing type or id`)
    return res.json({ subtitles: [] })
  }

  try {
    const subtitles = await handleSubtitleRequest(apiKey, type, id, config.baseUrl, req.params.config)
    console.log(`[SubX] subtitlesRoute: returning ${subtitles.length} subtitles`)
    res.json({ subtitles, cacheMaxAge: config.searchCacheTTL })
  } catch (err) {
    console.log(`[SubX] subtitlesRoute: error - ${err.message}`)
    res.json({ subtitles: [] })
  }
}

module.exports = { subtitlesRoute }
