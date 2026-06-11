const { decryptApiKey } = require('../crypto')
const { processDownload, getContentType } = require('../services/subtitleProcessor')
const config = require('../config')
const logger = require('../services/logger')
const { sanitizeFilename } = require('../utils/sanitize')

async function subtitleFileRoute(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', `max-age=${config.subtitleCacheTTL}`)

  logger.info({ subtitleId: req.params.subtitleId }, 'subtitleFileRoute: request received')
  const apiKey = decryptApiKey(req.params.config)
  if (!apiKey) {
    logger.warn('subtitleFileRoute: invalid config token, returning 404')
    return res.status(404).end()
  }

  const result = await processDownload(apiKey, req.params.subtitleId)
  if (!result) {
    logger.warn({ subtitleId: req.params.subtitleId }, 'subtitleFileRoute: no subtitle available, returning 404')
    return res.status(404).end()
  }

  const safeFilename = sanitizeFilename(result.filename)
  const contentType = getContentType(result.filename)
  logger.debug({ filename: safeFilename, size: result.buffer.length, contentType }, 'subtitleFileRoute: serving')
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`)
  res.send(result.buffer)
}

module.exports = { subtitleFileRoute }
