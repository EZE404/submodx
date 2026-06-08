const client = require('prom-client')

client.collectDefaultMetrics()

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
})

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
})

const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Cache hits by type',
  labelNames: ['type'],
})

const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Cache misses by type',
  labelNames: ['type'],
})

const subxUpstreamDuration = new client.Histogram({
  name: 'subx_upstream_duration_seconds',
  help: 'SubX API call duration in seconds',
  labelNames: ['operation', 'status'],
})

module.exports = {
  client,
  httpRequestDuration,
  httpRequestsTotal,
  cacheHits,
  cacheMisses,
  subxUpstreamDuration,
}
