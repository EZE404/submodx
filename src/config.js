const config = {
  secretWord: process.env.SECRET_WORD || '',
  baseUrl: (process.env.BASE_URL || process.env.SPACE_HOST || `http://localhost:${process.env.PORT || 7000}`).replace(/\/+$/, ''),
  maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS, 10) || 20,
  port: parseInt(process.env.PORT, 10) || 7000,
  subxBaseUrl: (process.env.SUBX_BASE_URL || 'https://subx-api.duckdns.org').replace(/\/+$/, ''),
  cacheDir: process.env.CACHE_DIR || '',
  searchCacheTTL: Math.max(0, parseInt(process.env.CACHE_SEARCH_TTL, 10) || 900),
  downloadCacheTTL: Math.max(0, parseInt(process.env.CACHE_DOWNLOAD_TTL, 10) || 86400),
  addonVersion: '1.0.0-beta'
}

module.exports = config
