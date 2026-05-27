const { getManifest } = require('../manifest')
const config = require('../config')

function manifestRoute(req, res) {
  const configurationRequired = !req.params.config
  console.log(`[SubX] manifestRoute: config=${req.params.config}, configurationRequired=${configurationRequired}`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const manifest = getManifest(config.baseUrl, { configurationRequired })
  res.json(manifest)
}

module.exports = { manifestRoute }
