const crypto = require('crypto')
const config = require('./config')

const ENCRYPTION_KEY = crypto.scryptSync(config.secretWord, 'subx-addon-salt', 32)

function encryptApiKey(apiKey) {
  console.log(`[SubX] encryptApiKey: generating token for apiKey length=${apiKey.length}`)
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
  console.log(`[SubX] decryptApiKey: token length=${token.length}`)
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

    console.log(`[SubX] decryptApiKey: success, apiKey length=${payload.apiKey.length}`)
    return payload.apiKey
  } catch (err) {
    console.log(`[SubX] decryptApiKey: failed - ${err.message}`)
    return null
  }
}

module.exports = { encryptApiKey, decryptApiKey }
