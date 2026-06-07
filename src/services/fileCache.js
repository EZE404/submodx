const fs = require('fs')
const path = require('path')
const logger = require('./logger')

function sanitizeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function createFileCache(cacheDir) {
  function get(key) {
    const sk = sanitizeKey(key)
    const metaPath = path.join(cacheDir, sk + '.meta')
    const datPath = path.join(cacheDir, sk + '.dat')

    let meta
    try {
      const metaRaw = fs.readFileSync(metaPath, 'utf8')
      meta = JSON.parse(metaRaw)
    } catch {
      try { fs.unlinkSync(metaPath) } catch {}
      try { fs.unlinkSync(datPath) } catch {}
      return undefined
    }

    if (Date.now() >= meta.expiresAt) {
      try { fs.unlinkSync(metaPath) } catch {}
      try { fs.unlinkSync(datPath) } catch {}
      return undefined
    }

    let buffer
    try {
      buffer = fs.readFileSync(datPath)
    } catch {
      try { fs.unlinkSync(metaPath) } catch {}
      try { fs.unlinkSync(datPath) } catch {}
      return undefined
    }

    return { buffer, filename: meta.filename }
  }

  function set(key, value, ttlSeconds) {
    if (ttlSeconds <= 0) return

    try {
      fs.mkdirSync(cacheDir, { recursive: true })
    } catch (err) {
      logger.error({ cacheDir, err }, 'fileCache: failed to create cache dir')
      return
    }

    const sk = sanitizeKey(key)
    const metaPath = path.join(cacheDir, sk + '.meta')
    const datPath = path.join(cacheDir, sk + '.dat')

    const meta = {
      filename: value.filename,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }

    try {
      fs.writeFileSync(datPath, value.buffer)
      fs.writeFileSync(metaPath, JSON.stringify(meta))
    } catch (err) {
      logger.error({ key: sk, err }, 'fileCache: failed to write cache entry')
      try { fs.unlinkSync(datPath) } catch {}
      try { fs.unlinkSync(metaPath) } catch {}
    }
  }

  return { get, set }
}

module.exports = { createFileCache }
