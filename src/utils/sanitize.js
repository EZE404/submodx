function sanitizeFilename(name) {
  return String(name)
    .replace(/["\r\n]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
}

function sanitizeForLogs(str) {
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u001B]/g, '?')
}

module.exports = { sanitizeFilename, sanitizeForLogs }
