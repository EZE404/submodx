const path = require('path')
const fs = require('fs')
const crypto = require('../crypto')
const subx = require('../services/subxClient')
const config = require('../config')

const templatePath = path.join(__dirname, '..', 'views', 'configure.html')
const template = fs.readFileSync(templatePath, 'utf-8')

async function verifyKeyRoute(req, res) {
  console.log(`[SubX] verifyKeyRoute: received key verification request`)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { apiKey } = req.body || {}
  if (!apiKey) {
    console.log(`[SubX] verifyKeyRoute: missing apiKey in body`)
    return res.json({ valid: false, error: 'API key es requerida' })
  }

  console.log(`[SubX] verifyKeyRoute: apiKey length=${apiKey.length}`)
  const result = await subx.verifyKey(apiKey)
  console.log(`[SubX] verifyKeyRoute: SubX verify returned valid=${result.valid}`)

  if (result.valid) {
    const token = crypto.encryptApiKey(apiKey)
    const baseUrl = config.baseUrl

    // Parse configured base URL
    const url = new URL(baseUrl)

    // Build host + path without trailing slash and without http/https
    const urlWithoutProtocol =
      `${url.host}${url.pathname}`.replace(/\/$/, '')

    // Standard HTTPS manifest URL
    const manifestUrl =
      `${baseUrl.replace(/\/$/, '')}/${token}/manifest.json`

    // Native Stremio protocol URL
    const stremioUrl =
      `stremio://${urlWithoutProtocol}/${token}/manifest.json`

    console.log(`[SubX] verifyKeyRoute: token generated (${token.length} chars)`)

    return res.json({
      valid: true,
      token,
      manifestUrl,
      stremioUrl
    })
  }

  console.log(`[SubX] verifyKeyRoute: key rejected by SubX`)
  res.json({ valid: false, error: 'Clave API inv\u00e1lida. Verifica que la clave sea correcta.' })
}

function formatDuration(seconds) {
  let amount
  let singular
  let plural

  // Less than 3 hours -> minutes
  if (seconds < 10800) {
    amount = Math.floor(seconds / 60)
    singular = 'minuto'
    plural = 'minutos'
  }

  // Between 3 and 72 hours -> hours
  else if (seconds <= 259200) {
    amount = Math.floor(seconds / 3600)
    singular = 'hora'
    plural = 'horas'
  }

  // More than 72 hours -> days
  else {
    amount = Math.floor(seconds / 86400)
    singular = 'día'
    plural = 'días'
  }

  return `${amount} ${amount === 1 ? singular : plural}`
}

function configurePageRoute(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    template
      .replace('{{SEARCH_CACHE_TTL}}', formatDuration(config.searchCacheTTL))
      .replace('{{DOWNLOAD_CACHE_TTL}}', formatDuration(config.downloadCacheTTL))
      .replace('{{MAX_SEARCH_RESULTS}}', config.maxSearchResults)
      .replace('{{ADDON_VERSION}}', config.addonVersion)
  )
}

module.exports = { configurePageRoute, verifyKeyRoute }
