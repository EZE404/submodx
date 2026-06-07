const config = require('../config')
const logger = require('./logger')

const SUBX_BASE = config.subxBaseUrl

function logRateLimit(res, context) {
  const remaining = res.headers.get('X-RateLimit-Remaining')
  const limit = res.headers.get('X-RateLimit-Limit')
  if (remaining !== null) {
    const remainingNum = parseInt(remaining, 10)
    if (remainingNum < 10) {
      logger.warn({ remaining, limit, context }, 'Rate limit low')
    } else {
      logger.debug({ remaining, limit, context }, 'Rate limit status')
    }
  }
}

async function healthCheck() {
  logger.debug({ url: `${SUBX_BASE}/api/health` }, 'healthCheck: calling')
  const res = await fetch(`${SUBX_BASE}/api/health`)
  const ok = res.ok
  logger.debug({ status: res.status, ok }, 'healthCheck: result')
  logRateLimit(res, 'healthCheck')
  return ok ? res.json() : null
}

async function verifyKey(apiKey) {
  try {
    logger.debug('verifyKey: calling search with known IMDB')
    const res = await fetch(`${SUBX_BASE}/api/subtitles/search?imdb_id=tt0773262&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    logger.info({ status: res.status, valid: res.ok }, 'verifyKey: result')
    logRateLimit(res, 'verifyKey')
    return { valid: res.ok, status: res.status }
  } catch (err) {
    logger.error({ err }, 'verifyKey: error')
    return { valid: false, error: err.message }
  }
}

async function search(apiKey, params) {
  try {
    const query = new URLSearchParams(params).toString()
    const url = `${SUBX_BASE}/api/subtitles/search?${query}`
    logger.debug({ url }, 'search: calling')
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    logger.debug({ status: res.status }, 'search: status')
    logRateLimit(res, 'search')
    if (!res.ok) return null
    const data = await res.json()
    logger.info({ count: data?.items?.length || 0 }, 'search: results')
    return data
  } catch (err) {
    logger.error({ err }, 'search: error')
    return null
  }
}

async function downloadRaw(apiKey, subtitleId) {
  try {
    logger.debug({ subtitleId }, 'downloadRaw: calling')
    const res = await fetch(`${SUBX_BASE}/api/subtitles/${subtitleId}/download`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    logger.debug({ status: res.status, ok: res.ok }, 'downloadRaw: result')
    logRateLimit(res, 'downloadRaw')
    if (!res.ok) return null
    return res
  } catch (err) {
    logger.error({ err, subtitleId }, 'downloadRaw: error')
    return null
  }
}

module.exports = { healthCheck, verifyKey, search, downloadRaw }
