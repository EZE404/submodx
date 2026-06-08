const config = require('../config')
const logger = require('./logger')
const metrics = require('./metrics')

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
  const endTimer = metrics.subxUpstreamDuration.startTimer({ operation: 'healthCheck' })
  try {
    logger.debug({ url: `${SUBX_BASE}/api/health` }, 'healthCheck: calling')
    const res = await fetch(`${SUBX_BASE}/api/health`)
    endTimer({ status: String(res.status) })
    const ok = res.ok
    logger.debug({ status: res.status, ok }, 'healthCheck: result')
    logRateLimit(res, 'healthCheck')
    return ok ? res.json() : null
  } catch (err) {
    endTimer({ status: 'error' })
    throw err
  }
}

async function verifyKey(apiKey) {
  const endTimer = metrics.subxUpstreamDuration.startTimer({ operation: 'verifyKey' })
  try {
    logger.debug('verifyKey: calling search with known IMDB')
    const res = await fetch(`${SUBX_BASE}/api/subtitles/search?imdb_id=tt0773262&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    endTimer({ status: String(res.status) })
    logger.info({ status: res.status, valid: res.ok }, 'verifyKey: result')
    logRateLimit(res, 'verifyKey')
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
      logger.warn({ retryAfter }, 'verifyKey: rate limited')
      return { valid: false, status: 429, rateLimited: true, retryAfter }
    }
    return { valid: res.ok, status: res.status }
  } catch (err) {
    endTimer({ status: 'error' })
    logger.error({ err }, 'verifyKey: error')
    return { valid: false, error: err.message }
  }
}

async function search(apiKey, params) {
  const endTimer = metrics.subxUpstreamDuration.startTimer({ operation: 'search' })
  try {
    const query = new URLSearchParams(params).toString()
    const url = `${SUBX_BASE}/api/subtitles/search?${query}`
    logger.debug({ url }, 'search: calling')
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    endTimer({ status: String(res.status) })
    logger.debug({ status: res.status }, 'search: status')
    logRateLimit(res, 'search')
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
        logger.warn({ retryAfter }, 'search: rate limited')
        return { rateLimited: true, retryAfter }
      }
      return null
    }
    const data = await res.json()
    logger.info({ count: data?.items?.length || 0 }, 'search: results')
    return data
  } catch (err) {
    endTimer({ status: 'error' })
    logger.error({ err }, 'search: error')
    return null
  }
}

async function downloadRaw(apiKey, subtitleId) {
  const endTimer = metrics.subxUpstreamDuration.startTimer({ operation: 'download' })
  try {
    logger.debug({ subtitleId }, 'downloadRaw: calling')
    const res = await fetch(`${SUBX_BASE}/api/subtitles/${subtitleId}/download`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    endTimer({ status: String(res.status) })
    logger.debug({ status: res.status, ok: res.ok }, 'downloadRaw: result')
    logRateLimit(res, 'downloadRaw')
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
        logger.warn({ retryAfter, subtitleId }, 'downloadRaw: rate limited')
        return { rateLimited: true, retryAfter, status: 429 }
      }
      return null
    }
    return res
  } catch (err) {
    endTimer({ status: 'error' })
    logger.error({ err, subtitleId }, 'downloadRaw: error')
    return null
  }
}

module.exports = { healthCheck, verifyKey, search, downloadRaw }
