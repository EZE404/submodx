const fs = require('fs')
const path = require('path')
const logger = require('../services/logger')

function sanitizeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9._-]/g, '_')
}

class LocalFilesystemStorage {
  constructor(basePath) {
    this.basePath = basePath
    try {
      fs.mkdirSync(basePath, { recursive: true })
      logger.info({ basePath }, 'LocalFilesystemStorage initialized')
    } catch (err) {
      logger.error({ err, basePath }, 'LocalFilesystemStorage: failed to create directory')
      throw err
    }
  }

  async get(id) {
    const safe = sanitizeKey(id)
    const dir = this.basePath

    let entries
    try {
      entries = await fs.promises.readdir(dir)
    } catch {
      return null
    }

    const match = entries.find(e => e.startsWith(safe + '.') && e !== safe + '.meta')
    if (!match) return null

    const ext = path.extname(match).toLowerCase().replace('.', '')
    const metaPath = path.join(dir, safe + '.meta')
    const filePath = path.join(dir, match)

    let buffer
    try {
      buffer = await fs.promises.readFile(filePath)
    } catch {
      return null
    }

    let filename = `subtitle_${id}.${ext}`
    try {
      const metaRaw = await fs.promises.readFile(metaPath, 'utf8')
      const meta = JSON.parse(metaRaw)
      if (meta.filename) filename = meta.filename
    } catch {
      // meta file missing or corrupt — fall back to default name
    }

    return { buffer, filename, ext }
  }

  async set(id, { buffer, filename, ext }) {
    const safe = sanitizeKey(id)
    const filePath = path.join(this.basePath, `${safe}.${ext}`)
    const metaPath = path.join(this.basePath, `${safe}.meta`)

    try {
      await fs.promises.writeFile(filePath, buffer)
      const meta = { filename, storedAt: Date.now() }
      await fs.promises.writeFile(metaPath, JSON.stringify(meta))
      logger.debug({ id: safe, ext, size: buffer.length }, 'LocalFilesystemStorage: stored')
    } catch (err) {
      logger.error({ err, id: safe }, 'LocalFilesystemStorage: write failed')
    }
  }

  async has(id) {
    const safe = sanitizeKey(id)
    const dir = this.basePath
    try {
      const entries = await fs.promises.readdir(dir)
      return entries.some(e => e.startsWith(safe + '.') && e !== safe + '.meta')
    } catch {
      return false
    }
  }
}

module.exports = LocalFilesystemStorage
