const { decryptApiKey } = require('../crypto')
const { processDownload, getContentType } = require('../services/subtitleProcessor')
const config = require('../config')
const { sanitizeFilename } = require('../utils/sanitize')

async function subtitleFileRoute(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', `max-age=${config.downloadCacheTTL}`)

  console.log(`[SubX] subtitleFileRoute: config=${req.params.config} subtitleId=${req.params.subtitleId}`)
  const apiKey = decryptApiKey(req.params.config)
  if (!apiKey) {
    console.log(`[SubX] subtitleFileRoute: invalid config token, returning 404`)
    return res.status(404).end()
  }

  const result = await processDownload(apiKey, req.params.subtitleId)
  if (!result) {
    console.log(`[SubX] subtitleFileRoute: no subtitle available, returning 404`)
    return res.status(404).end()
  }

  const safeFilename = sanitizeFilename(result.filename)
  const contentType = getContentType(result.filename)
  console.log(`[SubX] subtitleFileRoute: serving "${safeFilename}" (${result.buffer.length} bytes, ${contentType})`)
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`)
  res.send(result.buffer)
}

module.exports = { subtitleFileRoute }
