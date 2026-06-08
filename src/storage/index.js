const ValkeyCache = require('./ValkeyCache')
const LocalFilesystemStorage = require('./LocalFilesystemStorage')
const config = require('../config')

let searchCache = null
let subtitleHotCache = null
let persistentStorage = null
let initialized = false

async function initStorage() {
  if (initialized) return

  searchCache = new ValkeyCache({ prefix: 'search:' })
  await searchCache.connect({ host: config.valkeyHost, port: config.valkeyPort })

  subtitleHotCache = new ValkeyCache({ prefix: 'subtitle:' })
  await subtitleHotCache.connect({ host: config.valkeyHost, port: config.valkeyPort })

  persistentStorage = new LocalFilesystemStorage(config.cacheDirectory)

  initialized = true
}

async function disconnectStorage() {
  if (searchCache) await searchCache.disconnect()
  if (subtitleHotCache) await subtitleHotCache.disconnect()
  searchCache = null
  subtitleHotCache = null
  persistentStorage = null
  initialized = false
}

function getSearchCache() {
  return searchCache
}

function getSubtitleHotCache() {
  return subtitleHotCache
}

function getPersistentStorage() {
  return persistentStorage
}

module.exports = {
  initStorage,
  disconnectStorage,
  getSearchCache,
  getSubtitleHotCache,
  getPersistentStorage,
}
