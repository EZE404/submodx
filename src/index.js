const express = require('express')
const cors = require('cors')
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

app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  console.log(`[SubX] ${req.method} ${req.originalUrl}`)
  next()
})

const subpath = new URL(config.baseUrl).pathname.replace(/\/$/, '')

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
