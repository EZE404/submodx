const pino = require('pino')
const config = require('../config')

const transport = process.env.NODE_ENV !== 'production'
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined

const logger = pino({
  level: config.logLevel,
  transport,
})

module.exports = logger
