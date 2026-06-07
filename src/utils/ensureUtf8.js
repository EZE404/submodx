const iconv = require('iconv-lite')

function ensureUtf8(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return buffer
  }

  const asString = buffer.toString('utf-8')
  if (Buffer.from(asString, 'utf-8').equals(buffer)) {
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return buffer.subarray(3)
    }
    return buffer
  }

  try {
    const decoded = iconv.decode(buffer, 'latin1')
    return Buffer.from(decoded, 'utf-8')
  } catch {
    return buffer
  }
}

module.exports = { ensureUtf8 }
