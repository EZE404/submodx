const logger = require('../services/logger')

class ValkeyCache {
  constructor({ prefix = '' } = {}) {
    this.prefix = prefix
    this.client = null
  }

  async connect({ host, port }) {
    const Redis = require('ioredis')
    this.client = new Redis({
      host,
      port,
      enableOfflineQueue: false,
      retryStrategy: null,
      lazyConnect: true,
    })

    this.client.on('error', (err) => {
      logger.error({ err }, 'Valkey client error')
    })

    this.client.on('end', () => {
      logger.warn('Valkey connection closed')
    })

    await this.client.connect()
    await this.client.ping()
  }

  async get(key) {
    if (!this.client) return undefined
    const val = await this.client.get(this.prefix + key)
    if (val === null) return undefined
    return JSON.parse(val)
  }

  async set(key, value, ttlSeconds) {
    if (!this.client || ttlSeconds <= 0) return
    await this.client.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds)
  }

  async has(key) {
    if (!this.client) return false
    const count = await this.client.exists(this.prefix + key)
    return count === 1
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
  }
}

module.exports = ValkeyCache
