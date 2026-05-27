const path = require('path')
const subx = require('./subxClient')
const { createCache } = require('./cache')
const { createFileCache } = require('./fileCache')
const config = require('../config')
const { ensureUtf8 } = require('../utils/ensureUtf8')

const downloadCache = config.cacheDir
  ? createFileCache(config.cacheDir)
  : createCache()

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
  console.log(`[SubX] selectBestSubtitle: total=${entries.length} full=${full.length} forced=${forced.length} selected="${selected.entryName}" (size=${selected.size})`)
  return selected
}

function extractZip(buffer) {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  const subtitleEntries = entries
    .filter(e =>
      !e.isDirectory &&
      /\.(srt|sub|ass|ssa)$/i.test(e.entryName)
    )
    .map(e => ({
      entryName: e.entryName,
      getData: () => e.getData(),
      size: e.header.uncompressedSize,
    }))

  if (subtitleEntries.length === 0) {
    console.log(`[SubX] extractZip: no subtitle files found in archive`)
    return null
  }

  const names = subtitleEntries.map(e => `"${e.entryName}" (${e.size}B)`).join(', ')
  console.log(`[SubX] extractZip: found ${subtitleEntries.length} files: ${names}`)

  const selected = selectBestSubtitle(subtitleEntries)
  return {
    buffer: selected.getData(),
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

  if (subtitleFiles.length === 0) {
    console.log(`[SubX] extractRar: no subtitle files found in archive`)
    return null
  }

  const names = subtitleFiles.map(e => `"${e.entryName}" (${e.size}B)`).join(', ')
  console.log(`[SubX] extractRar: found ${subtitleFiles.length} files: ${names}`)

  const selected = selectBestSubtitle(subtitleFiles)
  return {
    buffer: selected.getData(),
    filename: path.basename(selected.entryName),
  }
}

async function processDownload(apiKey, subtitleId) {
  const cacheKey = `download:${subtitleId}`
  const cached = downloadCache.get(cacheKey)
  if (cached !== undefined) {
    console.log(`[SubX] downloadCache: HIT for ${cacheKey}`)
    return cached
  }

  const response = await subx.downloadRaw(apiKey, subtitleId)
  if (!response) {
    console.log(`[SubX] processDownload: SubX returned no response for ${subtitleId}`)
    return null
  }

  const cd = response.headers.get('content-disposition') || ''
  const match = cd.match(/filename="(.+)"/)
  let filename = match ? match[1] : `subtitle_${subtitleId}.srt`
  const ext = path.extname(filename).toLowerCase()

  console.log(`[SubX] processDownload: original filename="${filename}" ext=${ext} size=${response.headers.get('content-length') || 'unknown'} bytes`)

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let result
  if (ext === '.zip') {
    result = extractZip(buffer)
  } else if (ext === '.rar') {
    result = await extractRar(buffer)
  } else {
    console.log(`[SubX] processDownload: passthrough format (${ext})`)
    result = { buffer, filename }
  }

  if (result) {
    result.buffer = ensureUtf8(result.buffer)
    downloadCache.set(cacheKey, result, config.downloadCacheTTL)
  }
  return result
}

module.exports = { processDownload, getContentType }
