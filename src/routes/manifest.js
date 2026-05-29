const { getManifest } = require('../manifest')
const { decryptApiKey } = require('../crypto')
const config = require('../config')

function manifestRoute(req, res) {
  const configurationRequired = !req.params.config
  console.log(`[SubX] manifestRoute: config=${req.params.config}, configurationRequired=${configurationRequired}`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!configurationRequired) {
    const apiKey = decryptApiKey(req.params.config)
    if (!apiKey) {
      console.log(`[SubX] manifestRoute: invalid config token, returning 400`)
      return res.status(400).json({ error: 'Token de configuración inválido' })
    }
  }

  const manifest = getManifest(config.baseUrl, { configurationRequired })
  res.json(manifest)
}

module.exports = { manifestRoute }
