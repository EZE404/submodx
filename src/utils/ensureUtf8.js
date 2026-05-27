const jschardet = require('jschardet')
const iconv = require('iconv-lite')

function ensureUtf8(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return buffer
  }

  const result = jschardet.detect(buffer)
  const encoding = result ? result.encoding.toLowerCase() : 'ascii'
  const confidence = result ? result.confidence : 0

  if (encoding === 'utf-8' || encoding === 'ascii') {
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      const stripped = buffer.subarray(3)
      console.log(`[SubX] ensureUtf8: stripped UTF-8 BOM (${buffer.length} → ${stripped.length} bytes)`)
      return stripped
    }
    return buffer
  }

  try {
    const decoded = iconv.decode(buffer, encoding)
    const converted = Buffer.from(decoded, 'utf-8')
    console.log(`[SubX] ensureUtf8: converted from ${encoding} to UTF-8 (${buffer.length} → ${converted.length} bytes, confidence=${confidence.toFixed(2)})`)
    return converted
  } catch (err) {
    console.log(`[SubX] ensureUtf8: iconv failed for "${encoding}" (${err.message}), falling back to latin1`)
    try {
      const decoded = iconv.decode(buffer, 'latin1')
      const converted = Buffer.from(decoded, 'utf-8')
      console.log(`[SubX] ensureUtf8: fallback latin1→UTF-8 (${buffer.length} → ${converted.length} bytes)`)
      return converted
    } catch (fallbackErr) {
      console.log(`[SubX] ensureUtf8: fallback also failed, returning original buffer: ${fallbackErr.message}`)
      return buffer
    }
  }
}

module.exports = { ensureUtf8 }
