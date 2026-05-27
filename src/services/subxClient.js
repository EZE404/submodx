const config = require('../config')

const SUBX_BASE = config.subxBaseUrl

function logRateLimit(res, context) {
  const remaining = res.headers.get('X-RateLimit-Remaining')
  const limit = res.headers.get('X-RateLimit-Limit')
  if (remaining !== null) {
    console.log(`[SubX] ${context}: RateLimit ${remaining}/${limit}`)
    if (parseInt(remaining, 10) < 10) {
      console.warn(`[SubX] ${context}: RateLimit low (${remaining}/${limit})`)
    }
  }
}

async function healthCheck() {
  console.log(`[SubX] healthCheck: calling ${SUBX_BASE}/api/health`)
  const res = await fetch(`${SUBX_BASE}/api/health`)
  const ok = res.ok
  console.log(`[SubX] healthCheck: status=${res.status} ok=${ok}`)
  logRateLimit(res, 'healthCheck')
  return ok ? res.json() : null
}

async function verifyKey(apiKey) {
  try {
    const url = `${SUBX_BASE}/api/subtitles/search?imdb_id=tt0773262&limit=1`
    console.log(`[SubX] verifyKey: calling search with known IMDB`)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    console.log(`[SubX] verifyKey: status=${res.status} valid=${res.ok}`)
    logRateLimit(res, 'verifyKey')
    return { valid: res.ok, status: res.status }
  } catch (err) {
    console.log(`[SubX] verifyKey: error - ${err.message}`)
    return { valid: false, error: err.message }
  }
}

async function search(apiKey, params) {
  try {
    const query = new URLSearchParams(params).toString()
    const url = `${SUBX_BASE}/api/subtitles/search?${query}`
    console.log(`[SubX] search: ${url}`)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    console.log(`[SubX] search: status=${res.status}`)
    logRateLimit(res, 'search')
    if (!res.ok) return null
    const data = await res.json()
    console.log(`[SubX] search: response data=${JSON.stringify(data)}`)
    console.log(`[SubX] search: results count=${data?.items?.length || 0}`)
    return data
  } catch (err) {
    console.log(`[SubX] search: error - ${err.message}`)
    return null
  }
}

async function downloadRaw(apiKey, subtitleId) {
  try {
    const url = `${SUBX_BASE}/api/subtitles/${subtitleId}/download`
    console.log(`[SubX] downloadRaw: ${url}`)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    console.log(`[SubX] downloadRaw: status=${res.ok ? 'ok' : 'fail'} statusCode=${res.status}`)
    logRateLimit(res, 'downloadRaw')
    if (!res.ok) return null
    return res
  } catch (err) {
    console.log(`[SubX] downloadRaw: error - ${err.message}`)
    return null
  }
}

module.exports = { healthCheck, verifyKey, search, downloadRaw }
