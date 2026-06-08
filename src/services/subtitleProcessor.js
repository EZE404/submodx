const path = require('path')
const subx = require('./subxClient')
const { getSubtitleHotCache, getPersistentStorage } = require('../storage')
const config = require('../config')
const logger = require('./logger')
const metrics = require('./metrics')
const { ensureUtf8 } = require('../utils/ensureUtf8')
const { sanitizeFilename, sanitizeForLogs } = require('../utils/sanitize')
const {
  checkContentLength,
  checkEntrySize,
  checkCompressionRatio,
} = require('../utils/sizeLimits')

const EXT_TO_MIME = {
  '.srt': 'application/x-subrip; charset=utf-8',
  '.sub': 'text/x-microdvd; charset=utf-8',
  '.ssa': 'text/x-ass; charset=utf-8',
  '.ass': 'text/x-ass; charset=utf-8',
}

const EXT_PRIORITY = ['.srt', '.sub', '.ass', '.ssa']

const FORCED_PATTERNS = [
  /\bforced\b/i,
  /\bforzado\b/i,
  /\bforzados\b/i,
]

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase()
  return EXT_TO_MIME[ext] || 'text/plain; charset=utf-8'
}

function isForced(filename) {
  return FORCED_PATTERNS.some(p => p.test(filename))
}

function selectBestSubtitle(entries) {
  const full = []
  const forced = []

  for (const e of entries) {
    const ext = path.extname(e.entryName).toLowerCase()
    const extScore = EXT_PRIORITY.indexOf(ext)
    const item = {
      entry: e,
      extScore: extScore >= 0 ? extScore : 99,
    }
    ;(isForced(e.entryName) ? forced : full).push(item)
  }

  const candidates = full.length > 0 ? full : forced

  candidates.sort((a, b) => a.extScore - b.extScore || b.entry.size - a.entry.size)

  const selected = candidates[0].entry
  logger.debug({ total: entries.length, full: full.length, forced: forced.length, selected: sanitizeForLogs(selected.entryName), size: selected.size }, 'selectBestSubtitle')
  return selected
}

function detectArchiveFormat(buffer) {
  if (!buffer || buffer.length < 4) return null
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return 'zip'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 &&
    buffer[3] === 0x21 && buffer[4] === 0x1A &&
    (buffer[5] === 0x07 && (buffer[6] === 0x00 || buffer[6] === 0x01))
  ) return 'rar'
  return null
}

async function detectFormat(buffer) {
  try {
    const { fileTypeFromBuffer } = await import('file-type')
    const type = await fileTypeFromBuffer(buffer)
    if (type) return type.ext
  } catch {
    logger.debug('file-type import failed, falling back to magic-byte detection')
  }
  return detectArchiveFormat(buffer)
}

function extractZip(buffer) {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  if (entries.length > config.maxArchiveEntries) {
    throw new Error(`Zip archive has ${entries.length} entries, exceeds maximum ${config.maxArchiveEntries}`)
  }

  const subtitleEntries = entries
    .filter(e =>
      !e.isDirectory &&
      /\.(srt|sub|ass|ssa)$/i.test(e.entryName)
    )
    .map(e => {
      checkEntrySize(e.entryName, e.header.uncompressedSize)
      return {
        entryName: e.entryName,
        getData: () => e.getData(),
        size: e.header.uncompressedSize,
      }
    })

  if (subtitleEntries.length === 0) {
    logger.warn('extractZip: no subtitle files found in archive')
    return null
  }

  const names = subtitleEntries.map(e => `"${sanitizeForLogs(e.entryName)}" (${e.size}B)`).join(', ')
  logger.debug({ count: subtitleEntries.length, files: names }, 'extractZip')

  const selected = selectBestSubtitle(subtitleEntries)
  const data = selected.getData()
  checkCompressionRatio(buffer.length, data.length)

  return {
    buffer: data,
    filename: path.basename(selected.entryName),
  }
}

async function extractRar(buffer) {
  const unrar = require('node-unrar-js')
  const extractor = await unrar.createExtractorFromData({
    data: buffer.buffer,
  })
  const extracted = extractor.extract()
  const files = [...extracted.files]

  if (files.length > config.maxArchiveEntries) {
    throw new Error(`Rar archive has ${files.length} files, exceeds maximum ${config.maxArchiveEntries}`)
  }

  const subtitleFiles = files
    .filter(f =>
      !f.fileHeader.flags.directory &&
      /\.(srt|sub|ass|ssa)$/i.test(f.fileHeader.name)
    )
    .map(f => ({
      entryName: f.fileHeader.name,
      getData: () => Buffer.from(f.extraction),
      size: f.fileHeader.unpSize,
    }))

  for (const f of subtitleFiles) {
    checkEntrySize(f.entryName, f.size)
  }

  if (subtitleFiles.length === 0) {
    logger.warn('extractRar: no subtitle files found in archive')
    return null
  }

  const names = subtitleFiles.map(e => `"${sanitizeForLogs(e.entryName)}" (${e.size}B)`).join(', ')
  logger.debug({ count: subtitleFiles.length, files: names }, 'extractRar')

  const selected = selectBestSubtitle(subtitleFiles)
  return {
    buffer: selected.getData(),
    filename: path.basename(selected.entryName),
  }
}

async function processDownload(apiKey, subtitleId) {
  const hotCache = getSubtitleHotCache()
  const storage = getPersistentStorage()

  // Tier 1: Valkey hot cache
  const meta = await hotCache.get(subtitleId)
  if (meta) {
    const file = await storage.get(subtitleId)
    if (file) {
      logger.debug({ subtitleId }, 'downloadCache: HIT (hot)')
      metrics.cacheHits.inc({ type: 'subtitle_hot' })
      return file
    }
    // Metadata exists but file is missing from disk — fall through
    logger.warn({ subtitleId }, 'downloadCache: hot cache meta present but file missing from storage')
  }

  // Tier 2: Persistent storage
  const file = await storage.get(subtitleId)
  if (file) {
    logger.debug({ subtitleId }, 'downloadCache: HIT (storage)')
    metrics.cacheHits.inc({ type: 'subtitle_storage' })
    await hotCache.set(subtitleId, { id: subtitleId, ext: file.ext, storedAt: Date.now() }, config.subtitleCacheTTL)
    return file
  }

  // Tier 3: Complete miss
  metrics.cacheMisses.inc({ type: 'subtitle_storage' })

  const response = await subx.downloadRaw(apiKey, subtitleId)
  if (response?.rateLimited) {
    logger.warn({ retryAfter: response.retryAfter, subtitleId }, 'Download rate-limited')
    const message = `[SubmodX] Límite de API alcanzado. Espera ${response.retryAfter} segundos e intenta de nuevo.`
    return { buffer: Buffer.from(message), filename: `rate_limited_${subtitleId}.srt` }
  }
  if (!response) {
    logger.warn({ subtitleId }, 'processDownload: SubX returned no response')
    return null
  }

  checkContentLength(response.headers)

  const cd = response.headers.get('content-disposition') || ''
  const match = cd.match(/filename="(.+)"/)
  let filename = match ? match[1] : `subtitle_${subtitleId}.srt`
  filename = sanitizeFilename(filename)
  const ext = path.extname(filename).toLowerCase()

  logger.debug({ filename: sanitizeForLogs(filename), ext, size: response.headers.get('content-length') || 'unknown' }, 'processDownload')

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const detectedExt = await detectFormat(buffer)

  let result
  if (detectedExt === 'zip') {
    logger.debug('detected zip archive via binary signature')
    result = extractZip(buffer)
  } else if (detectedExt === 'rar') {
    logger.debug('detected rar archive via binary signature')
    result = await extractRar(buffer)
  } else if (detectedExt === 'srt' || detectedExt === 'sub' || detectedExt === 'ass' || detectedExt === 'ssa') {
    const useExt = detectedExt
    const useFilename = `subtitle_${subtitleId}.${useExt}`
    logger.debug({ ext: useExt }, 'processDownload: detected direct subtitle format')
    result = { buffer, filename: useFilename }
  } else if (ext === '.zip') {
    result = extractZip(buffer)
  } else if (ext === '.rar') {
    result = await extractRar(buffer)
  } else {
    logger.debug({ ext }, 'processDownload: passthrough format')
    result = { buffer, filename }
  }

  if (result) {
    result.buffer = ensureUtf8(result.buffer)
    const resultExt = path.extname(result.filename).toLowerCase().replace('.', '') || 'srt'
    await storage.set(subtitleId, { buffer: result.buffer, filename: result.filename, ext: resultExt })
    await hotCache.set(subtitleId, { id: subtitleId, ext: resultExt, storedAt: Date.now() }, config.subtitleCacheTTL)
  }
  return result
}

module.exports = { processDownload, getContentType }
