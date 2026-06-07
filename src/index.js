const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const pinoHttp = require('pino-http')
const path = require('path')
const config = require('./config')
const logger = require('./services/logger')
const { configurePageRoute, verifyKeyRoute } = require('./routes/configure')
const { manifestRoute } = require('./routes/manifest')
const { subtitlesRoute } = require('./routes/subtitles')
const { subtitleFileRoute } = require('./routes/subtitleFile')

if (!config.secretWord) {
  logger.fatal('SECRET_WORD environment variable is required')
  process.exit(1)
}

if (config.secretWord.length < 32) {
  logger.fatal('SECRET_WORD must be at least 32 characters long')
  process.exit(1)
}

const COMMON_DEFAULTS = ['change-me-to-a-strong-random-secret', 'secret', 'password']
if (COMMON_DEFAULTS.includes(config.secretWord)) {
  logger.fatal('SECRET_WORD must not be a default/example value')
  process.exit(1)
}

if (!process.env.BASE_URL && !process.env.SPACE_HOST) {
  logger.fatal('BASE_URL or SPACE_HOST environment variable is required')
  process.exit(1)
}

const app = express()

app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json())

const subpath = new URL(config.baseUrl).pathname.replace(/\/$/, '')

app.use(pinoHttp({
  logger,
  autoLogging: true,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url.replace(/\/[A-Za-z0-9_-]{40,}/g, '/[TOKEN]'),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: (err) => ({
      type: err.type,
      message: err.message,
      stack: err.stack,
    }),
  },
}))

const verifyKeyCors = cors({
  origin: config.baseUrl.replace(/\/$/, ''),
})
const generalCors = cors()

app.use((req, res, next) => {
  if (req.path.startsWith(subpath + '/api/verify-key')) {
    return verifyKeyCors(req, res, next)
  }
  return generalCors(req, res, next)
})

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const verifyKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

app.use(generalLimiter)

app.use(subpath, express.static(path.join(__dirname, '..', 'public')))

app.get(subpath + '/configure', configurePageRoute)
app.post(subpath + '/api/verify-key', verifyKeyLimiter, verifyKeyRoute)

app.get(subpath + '/manifest.json', manifestRoute)
app.get(subpath + '/:config/manifest.json', manifestRoute)
app.get(subpath + '/:config/srt/:subtitleId', subtitleFileRoute)
app.get(subpath + '/:config/subtitles/*', subtitlesRoute)
app.get(subpath + '/:config/configure', (req, res) => {
  res.redirect(subpath + '/configure')
})
app.get(subpath, (req, res) => {
  res.redirect(subpath + '/configure')
})

app.use((req, res) => {
  res.status(200).json({ subtitles: [] })
})

app.listen(config.port, () => {
  logger.info({ port: config.port, baseUrl: config.baseUrl, subxBaseUrl: config.subxBaseUrl }, 'Server started')
})
