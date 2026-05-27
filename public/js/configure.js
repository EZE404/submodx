const apiKeyInput = document.getElementById('apiKey')
const testBtn = document.getElementById('testBtn')
const feedback = document.getElementById('feedback')
const resultSection = document.getElementById('resultSection')
const manifestUrl = document.getElementById('manifestUrl')
const copyBtn = document.getElementById('copyBtn')
const installBtn = document.getElementById('installBtn')
const resetBtn = document.getElementById('resetBtn')

let currentManifestUrl = ''
let currentStremioUrl = ''

testBtn.addEventListener('click', testKey)
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') testKey() })

async function testKey() {
  const apiKey = apiKeyInput.value.trim()
  if (!apiKey) {
    showFeedback('Introduce una clave API', 'invalid')
    return
  }

  setLoading(true)
  showFeedback('', '')

  try {
    const res = await fetch('api/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    const data = await res.json()

    if (data.valid) {
      showFeedback('\u2705 Clave v\u00e1lida', 'valid')
      currentManifestUrl = data.manifestUrl
      currentStremioUrl = data.stremioUrl
      manifestUrl.value = data.manifestUrl
      resultSection.style.display = 'block'
    } else {
      showFeedback('\u274c ' + (data.error || 'Clave inv\u00e1lida'), 'invalid')
      resultSection.style.display = 'none'
    }
  } catch (err) {
    showFeedback('\u274c Error de conexi\u00f3n: ' + err.message, 'invalid')
    resultSection.style.display = 'none'
  } finally {
    setLoading(false)
  }
}

function showFeedback(msg, type) {
  feedback.textContent = msg
  feedback.className = 'feedback' + (type ? ' feedback-' + type : '')
}

function setLoading(loading) {
  testBtn.disabled = loading
  testBtn.textContent = loading ? '\u231b Verificando...' : 'Probar clave'
}

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(manifestUrl.value)
    const orig = copyBtn.textContent
    copyBtn.textContent = '\u2705 Copiado'
    setTimeout(() => copyBtn.textContent = orig, 2000)
  } catch {
    manifestUrl.select()
  }
})

installBtn.addEventListener('click', () => {
  window.open(currentStremioUrl, '_blank')
})

resetBtn.addEventListener('click', () => {
  apiKeyInput.value = ''
  apiKeyInput.focus()
  resultSection.style.display = 'none'
  showFeedback('', '')
})