const crypto = require('crypto')
const config = require('./config')
const logger = require('./services/logger')

const ENCRYPTION_KEY = crypto.scryptSync(config.secretWord, 'subx-addon-salt', 32)

function encryptApiKey(apiKey) {
  logger.debug({ apiKeyLength: apiKey.length }, 'encryptApiKey: generating token')
  const payload = JSON.stringify({
    v: 1,
    apiKey: apiKey,
    iat: Math.floor(Date.now() / 1000),
  })

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)

  let encrypted = cipher.update(payload, 'utf8')
  cipher.final()

  const tag = cipher.getAuthTag()

  const combined = Buffer.concat([iv, tag, encrypted])
  return combined.toString('base64url')
}

function decryptApiKey(token) {
  logger.debug({ tokenLength: token.length }, 'decryptApiKey')
  try {
    const combined = Buffer.from(token, 'base64url')

    const iv = combined.subarray(0, 12)
    const tag = combined.subarray(12, 28)
    const encrypted = combined.subarray(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encrypted, null, 'utf8')
    decipher.final()

    const payload = JSON.parse(decrypted)
    if (payload.v !== 1) return null

    logger.debug({ apiKeyLength: payload.apiKey.length }, 'decryptApiKey: success')
    return payload.apiKey
  } catch (err) {
    logger.warn({ err }, 'decryptApiKey: failed')
    return null
  }
}

module.exports = { encryptApiKey, decryptApiKey }
