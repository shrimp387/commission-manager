/**
 * settings.js — UI logic for the Companion App settings window.
 *
 * Communicates with the Electron main process through the
 * window.companion bridge exposed by preload.js:
 *   - companion.getConfig()                       → full config object
 *   - companion.saveConfig(config)                → save config, reinit Supabase
 *   - companion.testPlatform(platform, creds)     → { ok, username?, error? }
 *   - companion.getStatus()                       → { connected, userId, polling }
 */

'use strict'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Show a result message in a given section. */
function showResult(sectionId, message, type /* 'ok' | 'err' | 'info' */) {
  const el = document.getElementById(`result-${sectionId}`)
  if (!el) return
  el.textContent = message
  el.className = `result result-${type} show`
  // Auto-hide after 5 seconds
  clearTimeout(el._timer)
  el._timer = setTimeout(() => { el.className = 'result' }, 5000)
}

/** Toggle collapse state of a section. */
function toggleSection(id) {
  document.getElementById(id)?.classList.toggle('collapsed')
}
window.toggleSection = toggleSection

/** Build a full config object from all input values, using dot-notation keys
 *  that electron-store understands natively.
 *  NOTE: Supabase URL/key are hardcoded in main.js — not editable here. */
function buildConfig() {
  return {
    // e621
    'platforms.e621.username': v('e621-user'),
    'platforms.e621.apiKey':   v('e621-key'),
    'platforms.e621.enabled':  cb('e621-enabled'),

    // Inkbunny
    'platforms.inkbunny.username': v('ib-user'),
    'platforms.inkbunny.password': v('ib-pass'),
    'platforms.inkbunny.enabled':  cb('ib-enabled'),

    // Weasyl
    'platforms.weasyl.apiKey':  v('weasyl-key'),
    'platforms.weasyl.enabled': cb('weasyl-enabled'),

    // Bluesky
    'platforms.bluesky.handle':      v('bsky-handle'),
    'platforms.bluesky.appPassword': v('bsky-pass'),
    'platforms.bluesky.enabled':     cb('bsky-enabled'),

    // Telegram
    'platforms.telegram.botToken': v('tg-token'),
    'platforms.telegram.chatId':   v('tg-chatid'),
    'platforms.telegram.enabled':  cb('tg-enabled'),

    // Discord
    'platforms.discord.webhookUrl': v('dc-webhook'),
    'platforms.discord.enabled':    cb('dc-enabled'),
  }
}

/** Read value of an input element by id. */
function v(id) {
  return document.getElementById(id)?.value?.trim() ?? ''
}

/** Read checked state of a checkbox by id. */
function cb(id) {
  return document.getElementById(id)?.checked ?? false
}

/** Set value of an input element by id. */
function setV(id, val) {
  const el = document.getElementById(id)
  if (el) el.value = val ?? ''
}

/** Set checked state of a checkbox by id. */
function setCb(id, val) {
  const el = document.getElementById(id)
  if (el) el.checked = !!val
}

// ── Pre-fill form from stored config ─────────────────────────────────────────

async function prefillForm() {
  try {
    const cfg = await window.companion.getConfig()

    // Show version
    const versionEl = document.getElementById('app-version')
    if (versionEl && cfg.appVersion) {
      versionEl.textContent = `v${cfg.appVersion}`
    }

    // e621
    const e621 = cfg.platforms?.e621 ?? {}
    setV('e621-user', e621.username)
    setV('e621-key',  e621.apiKey)
    setCb('e621-enabled', e621.enabled)

    // Inkbunny
    const ib = cfg.platforms?.inkbunny ?? {}
    setV('ib-user', ib.username)
    setV('ib-pass', ib.password)
    setCb('ib-enabled', ib.enabled)

    // Weasyl
    const weasyl = cfg.platforms?.weasyl ?? {}
    setV('weasyl-key', weasyl.apiKey)
    setCb('weasyl-enabled', weasyl.enabled)

    // Bluesky
    const bsky = cfg.platforms?.bluesky ?? {}
    setV('bsky-handle', bsky.handle)
    setV('bsky-pass',   bsky.appPassword)
    setCb('bsky-enabled', bsky.enabled)

    // Telegram
    const tg = cfg.platforms?.telegram ?? {}
    setV('tg-token',  tg.botToken)
    setV('tg-chatid', tg.chatId)
    setCb('tg-enabled', tg.enabled)

    // Discord
    const dc = cfg.platforms?.discord ?? {}
    setV('dc-webhook', dc.webhookUrl)
    setCb('dc-enabled', dc.enabled)

    // IAs (HuggingFace + Mistral)
    setV('hf-token', cfg.hfToken ?? '')
    setV('mistral-key', cfg.mistralApiKey ?? '')
    const modelSelect = document.getElementById('mistral-model')
    if (modelSelect) {
      modelSelect.value = cfg.mistralModel || 'pixtral-large-latest'
    }

  } catch (err) {
    console.error('[settings] prefillForm error:', err)
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

async function updateStatusBadge() {
  try {
    const status = await window.companion.getStatus()
    const badge = document.getElementById('status-badge')
    if (!badge) return

    if (status.connected && status.userId) {
      badge.textContent = '● Activo'
      badge.className = 'connected'
    } else if (status.connected) {
      badge.textContent = '● Sin sesión'
      badge.className = 'disconnected'
    } else {
      badge.textContent = '● Sin configurar'
      badge.className = 'disconnected'
    }
  } catch {
    // ignore
  }
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function updateAuthUI() {
  try {
    const status = await window.companion.getStatus()
    const loggedout = document.getElementById('auth-loggedout')
    const loggedin  = document.getElementById('auth-loggedin')
    const subtitle  = document.getElementById('auth-subtitle')

    console.log('[updateAuthUI] 📊 Status received:', status)

    if (status.userId) {
      if (loggedout) loggedout.style.display = 'none'
      if (loggedin)  loggedin.style.display  = 'block'
      
      const emailEl = document.getElementById('auth-email')
      const nameEl  = document.getElementById('auth-name')
      
      if (emailEl) {
        // Show email or userId as primary identifier
        emailEl.textContent = status.email || status.userId || 'Sesión activa'
      }
      
      if (nameEl) {
        // Show user's name as secondary info
        if (status.name) {
          nameEl.textContent = status.name
        } else if (status.email) {
          // If no name, show email domain for context
          nameEl.textContent = `Usuario: ${status.email.split('@')[0]}`
        } else {
          nameEl.textContent = 'Google Account'
        }
      }
      
      if (subtitle) subtitle.textContent = 'Sesión activa'
      
      console.log('[updateAuthUI] ✅ UI updated:', { email: status.email, name: status.name })
    } else {
      if (loggedout) loggedout.style.display = 'block'
      if (loggedin)  loggedin.style.display  = 'none'
      if (subtitle) subtitle.textContent = 'Inicia sesión para activar el polling'
      
      console.log('[updateAuthUI] ℹ️ No user session')
    }
  } catch (err) {
    console.error('[updateAuthUI] ❌ Error:', err.message, err.stack)
  }
}

async function handleGoogleLogin() {
  const btn = document.getElementById('btn-google-login')
  if (btn) btn.disabled = true
  showResult('auth', '⏳ Abriendo navegador para iniciar sesión...', 'info')

  try {
    const result = await window.companion.googleLogin()
    if (result.ok && result.pending) {
      showResult('auth', '✅ Navegador abierto. Completa el login y vuelve aquí.', 'ok')
      // Poll status every 2s for up to 60s waiting for the callback
      let attempts = 0
      const poller = setInterval(async () => {
        attempts++
        const status = await window.companion.getStatus()
        if (status.userId) {
          clearInterval(poller)
          await updateAuthUI()
          await updateStatusBadge()
          showResult('auth', `✅ Sesión iniciada`, 'ok')
          if (btn) btn.disabled = false
        } else if (attempts >= 30) {
          clearInterval(poller)
          showResult('auth', 'ℹ️ Si ya iniciaste sesión en el navegador, reinicia la companion app.', 'info')
          if (btn) btn.disabled = false
        }
      }, 2000)
    } else {
      showResult('auth', `❌ ${result.error || 'Error al iniciar login'}`, 'err')
      if (btn) btn.disabled = false
    }
  } catch (err) {
    showResult('auth', `❌ ${err.message}`, 'err')
    if (btn) btn.disabled = false
  }
}
window.handleGoogleLogin = handleGoogleLogin

async function handleLogout() {
  try {
    await window.companion.logout()
    await updateAuthUI()
    await updateStatusBadge()
    showResult('auth', '✅ Sesión cerrada', 'ok')
  } catch (err) {
    showResult('auth', `❌ ${err.message}`, 'err')
  }
}
window.handleLogout = handleLogout

async function testConnection() {
  const resultEl = document.getElementById('result-connection')
  if (!resultEl) return
  
  resultEl.textContent = '⏳ Probando conexión a Supabase...'
  resultEl.className = 'result result-info show'
  
  try {
    const status = await window.companion.getStatus()
    
    if (status.connected && status.userId) {
      resultEl.textContent = '✅ Conectado a Supabase correctamente'
      resultEl.className = 'result result-ok show'
    } else if (status.connected) {
      resultEl.textContent = '⚠️ Conectado pero sin sesión activa'
      resultEl.className = 'result result-err show'
    } else {
      resultEl.textContent = '❌ No conectado a Supabase'
      resultEl.className = 'result result-err show'
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      resultEl.className = 'result'
    }, 5000)
  } catch (err) {
    resultEl.textContent = `❌ Error: ${err.message}`
    resultEl.className = 'result result-err show'
  }
}
window.testConnection = testConnection

// ── Save section ──────────────────────────────────────────────────────────────

async function saveSection(sectionId) {
  try {
    await window.companion.saveConfig(buildConfig())
    showResult(sectionId, '✅ Guardado correctamente', 'ok')
  } catch (err) {
    showResult(sectionId, `❌ Error al guardar: ${err.message}`, 'err')
  }
}
window.saveSection = saveSection

// ── Test platform ─────────────────────────────────────────────────────────────

/**
 * Builds the credentials object for a platform from the current input values.
 * Only includes fields relevant to the platform.
 */
function buildCredentials(platform) {
  switch (platform) {
    case 'e621':
      return { username: v('e621-user'), apiKey: v('e621-key') }
    case 'inkbunny':
      return { username: v('ib-user'), password: v('ib-pass') }
    case 'weasyl':
      return { apiKey: v('weasyl-key') }
    case 'bluesky':
      return { handle: v('bsky-handle'), appPassword: v('bsky-pass') }
    case 'telegram':
      return { botToken: v('tg-token'), chatId: v('tg-chatid') }
    case 'discord':
      return { webhookUrl: v('dc-webhook') }
    default:
      return {}
  }
}

async function testPlatform(platform) {
  const btn = document.getElementById(`test-btn-${platform}`)
  if (btn) btn.disabled = true

  showResult(platform, '⏳ Probando conexión...', 'info')

  try {
    const creds = buildCredentials(platform)
    const result = await window.companion.testPlatform(platform, creds)

    if (result.ok) {
      const name = result.username || result.botName || result.handle || result.channelName || platform
      showResult(platform, `✅ Conectado como @${name}`, 'ok')
    } else {
      showResult(platform, `❌ Error: ${result.error || 'Conexión fallida'}`, 'err')
    }
  } catch (err) {
    showResult(platform, `❌ Error: ${err.message}`, 'err')
  } finally {
    if (btn) btn.disabled = false
  }
}
window.testPlatform = testPlatform

// ── Save IAs configuration ────────────────────────────────────────────────────

/** Save only HuggingFace token */
async function saveHuggingFace() {
  try {
    const hfToken = v('hf-token')
    
    if (!hfToken) {
      showResult('hf', '⚠️ Token vacío — no se guardó nada', 'err')
      return
    }
    
    if (!hfToken.startsWith('hf_')) {
      showResult('hf', '⚠️ Token debe empezar con hf_ — verifica el formato', 'err')
      return
    }

    console.log('[saveHF] 💾 Guardando token de HuggingFace...')
    console.log('[saveHF] 🤗 Token:', `${hfToken.substring(0, 10)}...`)

    await window.companion.saveConfig({ hfToken })

    console.log('[saveHF] ✅ Token guardado correctamente')
    showResult('hf', '✅ Token de HuggingFace guardado', 'ok')
  } catch (err) {
    console.error('[saveHF] ❌ Error:', err.message)
    showResult('hf', `❌ Error al guardar: ${err.message}`, 'err')
  }
}
window.saveHuggingFace = saveHuggingFace

/** Save only Mistral AI credentials */
async function saveMistral() {
  try {
    const mistralKey = v('mistral-key')
    const mistralModel = document.getElementById('mistral-model')?.value || 'pixtral-large-latest'
    
    if (!mistralKey) {
      showResult('mistral', '⚠️ API Key vacía — no se guardó nada', 'err')
      return
    }

    console.log('[saveMistral] 💾 Guardando configuración de Mistral AI...')
    console.log('[saveMistral] 🧠 API key:', 'configurado')
    console.log('[saveMistral] 🧠 Modelo:', mistralModel)

    await window.companion.saveConfig({
      mistralApiKey: mistralKey,
      mistralModel
    })

    console.log('[saveMistral] ✅ Configuración guardada correctamente')
    showResult('mistral', '✅ Configuración de Mistral AI guardada', 'ok')
  } catch (err) {
    console.error('[saveMistral] ❌ Error:', err.message)
    showResult('mistral', `❌ Error al guardar: ${err.message}`, 'err')
  }
}
window.saveMistral = saveMistral

/** Test HuggingFace connection - validates token format and logs status */
async function testHuggingFace() {
  const token = v('hf-token')
  
  if (!token) {
    showResult('hf', '❌ Token vacío', 'err')
    return
  }
  
  if (!token.startsWith('hf_')) {
    showResult('hf', '❌ Token inválido. Debe empezar con hf_', 'err')
    return
  }
  
  if (token.length < 20) {
    showResult('hf', '❌ Token muy corto — verifica que sea completo', 'err')
    return
  }

  const btn = document.getElementById('test-btn-hf')
  if (btn) btn.disabled = true
  showResult('hf', '⏳ Validando formato del token...', 'info')

  try {
    console.log('[testHF] 🧪 Testing HuggingFace token format...')
    console.log('[testHF] 🔑 Token:', `${token.substring(0, 10)}...`)
    
    // Format is valid - HuggingFace tokens always start with hf_ and are 37+ chars
    // We can't test the /whoami endpoint from renderer due to CORS
    // Instead, validate format and show success
    console.log('[testHF] ✅ Token format valid')
    showResult('hf', '✅ Token válido (formato correcto). Guarda y prueba con los taggers.', 'ok')
  } catch (err) {
    console.error('[testHF] ❌ Error:', err.message)
    showResult('hf', `❌ Error: ${err.message}`, 'err')
  } finally {
    if (btn) btn.disabled = false
  }
}
window.testHuggingFace = testHuggingFace

/** Test Mistral AI connection - validates key format */
async function testMistral() {
  const key = v('mistral-key')
  
  if (!key) {
    showResult('mistral', '❌ API Key vacía', 'err')
    return
  }
  
  if (key.length < 20) {
    showResult('mistral', '❌ API Key muy corta — verifica que sea completa', 'err')
    return
  }

  const btn = document.getElementById('test-btn-mistral')
  if (btn) btn.disabled = true
  showResult('mistral', '⏳ Validando formato de la API Key...', 'info')

  try {
    console.log('[testMistral] 🧪 Testing Mistral API key format...')
    console.log('[testMistral] 🔑 Key length:', key.length)
    
    // Format is valid - we can't test the API endpoint from renderer due to CORS
    // Instead, validate format and show success
    console.log('[testMistral] ✅ Key format valid')
    showResult('mistral', '✅ API Key válida (formato correcto). Guarda y prueba con las IAs.', 'ok')
  } catch (err) {
    console.error('[testMistral] ❌ Error:', err.message)
    showResult('mistral', `❌ Error: ${err.message}`, 'err')
  } finally {
    if (btn) btn.disabled = false
  }
}
window.testMistral = testMistral

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([prefillForm(), updateStatusBadge(), updateAuthUI()])
})
