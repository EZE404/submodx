const { getManifest } = require('../manifest')
const { decryptApiKey } = require('../crypto')
const config = require('../config')
const logger = require('../services/logger')

function manifestRoute(req, res) {
  const configurationRequired = !req.params.config
  logger.info({ configurationRequired }, 'manifestRoute')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!configurationRequired) {
    const apiKey = decryptApiKey(req.params.config)
    if (!apiKey) {
      logger.warn('manifestRoute: invalid config token, returning 400')
      return res.status(400).json({ error: 'Token de configuración inválido' })
    }
  }

  const manifest = getManifest(config.baseUrl, { configurationRequired })
  res.json(manifest)
}

module.exports = { manifestRoute }
