const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const config = require('./config')
const { configurePageRoute, verifyKeyRoute } = require('./routes/configure')
const { manifestRoute } = require('./routes/manifest')
const { subtitlesRoute } = require('./routes/subtitles')
const { subtitleFileRoute } = require('./routes/subtitleFile')

if (!config.secretWord) {
  console.error('[SubX] FATAL: SECRET_WORD environment variable is required')
  process.exit(1)
}

const app = express()

app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json())

const subpath = new URL(config.baseUrl).pathname.replace(/\/$/, '')

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

app.use((req, res, next) => {
  console.log(`[SubX] ${req.method} ${req.originalUrl}`)
  next()
})

app.use(subpath, express.static(path.join(__dirname, '..', 'public')))

app.get(subpath + '/configure', configurePageRoute)
app.post(subpath + '/api/verify-key', verifyKeyRoute)

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
  console.log(`[SubX] SubX Subtitles addon running on port ${config.port}`)
  console.log(`[SubX] BASE_URL: ${config.baseUrl}`)
  console.log(`[SubX] SUBX_BASE_URL: ${config.subxBaseUrl}`)
})
