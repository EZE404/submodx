const config = require('../config')

function checkContentLength(headers) {
  const len = parseInt(headers.get('content-length'), 10)
  if (!isNaN(len) && len > config.maxResponseBytes) {
    throw new Error(
      `Response content-length ${len} exceeds maximum ${config.maxResponseBytes}`
    )
  }
}

function checkEntrySize(name, size) {
  if (size > config.maxEntryBytes) {
    throw new Error(
      `Entry "${name}" size ${size} bytes exceeds maximum ${config.maxEntryBytes}`
    )
  }
}

function checkCompressionRatio(compressedSize, uncompressedSize) {
  if (compressedSize > 0 && uncompressedSize > compressedSize * config.maxCompressionRatio) {
    const ratio = (uncompressedSize / compressedSize).toFixed(1)
    throw new Error(
      `Compression ratio ${ratio}x exceeds maximum ${config.maxCompressionRatio}x`
    )
  }
}

module.exports = {
  checkContentLength,
  checkEntrySize,
  checkCompressionRatio,
}
