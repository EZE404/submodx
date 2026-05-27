function createCache() {
  const store = new Map()

  function get(key) {
    const entry = store.get(key)
    if (entry === undefined) return undefined
    if (Date.now() >= entry.expiresAt) {
      store.delete(key)
      return undefined
    }
    return entry.value
  }

  function set(key, value, ttlSeconds) {
    if (ttlSeconds <= 0) return
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  function has(key) {
    const entry = store.get(key)
    if (entry === undefined) return false
    if (Date.now() >= entry.expiresAt) {
      store.delete(key)
      return false
    }
    return true
  }

  return { get, set, has }
}

module.exports = { createCache }
