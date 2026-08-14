/**
 * main.js — Electron entry point for Commission Manager Companion App
 *
 * This app runs on the artist's PC and:
 * 1. Shows a system tray icon (runs in background)
 * 2. Polls Supabase for pending publish jobs
 * 3. Executes each job using the appropriate platform publisher
 * 4. Reports results back to Supabase
 * 5. Provides a settings window for platform credentials
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron')
const path = require('path')
const Store = require('electron-store')
const { createClient } = require('@supabase/supabase-js')
const { JobRunner } = require('./jobRunner')

// ── Config store (encrypted on disk) ─────────────────────────────────────────
const store = new Store({
  encryptionKey: 'commission-manager-companion-v1',
  defaults: {
    // Supabase credentials — hardcoded for this deployment.
    // The user never needs to enter these; they are pre-configured.
    supabaseUrl:     'https://yhlhsqhlnzgrhagoeosp.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGhzcWhsbnpncmhhZ29lb3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjEzMjIsImV4cCI6MjEwMTg5NzMyMn0.5OR7M62fNWnsPzNuyu06ub-joZusH9Ud9yeTcvp6dWc',
    supabaseUserId:  '', // filled automatically after Google login
    pollInterval: 5000,
    
    // IA tokens
    hfToken: '',         // HuggingFace API token for taggers
    mistralApiKey: '',   // Mistral AI API key
    mistralModel: 'pixtral-large-latest',
    
    platforms: {
      e621:        { username: '', apiKey: '',      enabled: false },
      inkbunny:    { username: '', password: '',    enabled: false, useBrowser: false },
      weasyl:      { apiKey: '',                   enabled: false },
      bluesky:     { handle: '', appPassword: '',  enabled: false },
      telegram:    { botToken: '', chatId: '',      enabled: false },
      discord:     { webhookUrl: '',               enabled: false },
      furaffinity: { enabled: false },
      pixiv:       { enabled: false },
      patreon:     { enabled: false },
    }
  }
})

// ── Globals ───────────────────────────────────────────────────────────────────
let tray = null
let settingsWindow = null
let supabase = null
let jobRunner = null
let pollTimer = null
let isRunning = false

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAppUserModelId('Commission Manager Companion')

  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║  COMMISSION MANAGER COMPANION v1.8.0 - STARTING UP...   ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  createTray()
  initSupabase()
  startOAuthCallback()   // listen for Google OAuth redirect
  startTagServer()       // local WD-Tagger endpoint for web app

  // ── Start Polling ───────────────────────────────────────────────────
  startPolling()

  // Open settings on first run if user has not logged in yet
  if (!store.get('supabaseUserId')) {
    console.log('[startup] 👤 No hay sesión de usuario - abriendo Settings...\n')
    openSettings()
  } else {
    console.log('[startup] ✅ Usuario autenticado:', store.get('supabaseUserId').slice(0, 8) + '...\n')
  }

  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║        COMPANION APP LISTA - POLLING ACTIVO              ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')
})

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed — keep running in tray
})

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a simple colored icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA'
  )
  tray = new Tray(icon)

  updateTrayMenu()
  tray.setToolTip('Commission Manager Companion')
  tray.on('double-click', openSettings)
}

function updateTrayMenu(status = 'idle') {
  const pkg = require('../package.json')
  const statusLabel = {
    idle:      '⚪ Esperando jobs...',
    running:   '🟢 Publicando...',
    error:     '🔴 Error — ver configuración',
    noconfig:  '⚠️ Inicia sesión en Configuración',
  }[status] || '⚪ Activo'

  const menu = Menu.buildFromTemplate([
    { label: `Commission Manager Companion v${pkg.version}`, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '⚙ Configuración', click: openSettings },
    { label: '📋 Ver Logs', click: openLogsWindow },
    { label: '🌐 Abrir app web', click: () => shell.openExternal('https://commission-manager-plum.vercel.app') },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.quit() } }
  ])
  tray.setContextMenu(menu)
}

// ── Settings window ───────────────────────────────────────────────────────────
let logsWindow = null

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 420,               // ← Más pequeña (antes 700)
    height: 650,              // ← Más alta (antes 600)
    x: 20,                    // ← Pegadita al lado izquierdo
    y: 100,                   // ← Un poco abajo del top
    title: 'Companion App — Configuración',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
    resizable: true,          // ← Permitir resize
    minimizable: true,
    maximizable: true,        // ← Permitir maximizar
    icon: path.join(__dirname, '..', 'assets', 'icon.png'), // ← Icono de la app
  })

  settingsWindow.loadFile(path.join(__dirname, '..', 'ui', 'settings.html'))

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function openLogsWindow() {
  if (logsWindow) {
    logsWindow.focus()
    return
  }

  logsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Companion App — Logs',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  })

  logsWindow.loadFile(path.join(__dirname, '..', 'ui', 'logs.html'))

  logsWindow.on('closed', () => {
    logsWindow = null
  })
}

// ── Supabase credentials (hardcoded — no user configuration needed) ───────────
const SUPABASE_URL     = 'https://yhlhsqhlnzgrhagoeosp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGhzcWhsbnpncmhhZ29lb3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjEzMjIsImV4cCI6MjEwMTg5NzMyMn0.5OR7M62fNWnsPzNuyu06ub-joZusH9Ud9yeTcvp6dWc'

// ── Supabase init ─────────────────────────────────────────────────────────────
function initSupabase() {
  // Always use hardcoded credentials — overwrite whatever is stored
  store.set('supabaseUrl',     SUPABASE_URL)
  store.set('supabaseAnonKey', SUPABASE_ANON_KEY)

  // Disable realtime entirely — we only need REST/Auth, not WebSocket subscriptions.
  // This avoids the "native WebSocket not found" error on Electron's Node 20 runtime.
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
      // Provide a no-op WebSocket so the client doesn't crash on init
      transport: class NoOpWS {
        constructor() { this.readyState = 3 /* CLOSED */ }
        send() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
  })

  jobRunner = new JobRunner(supabase, store)

  const userId = store.get('supabaseUserId')
  updateTrayMenu(userId ? 'idle' : 'noconfig')
}

// ── Job polling ───────────────────────────────────────────────────────────────
function startPolling() {
  const interval = store.get('pollInterval') || 5000

  async function poll() {
    if (!supabase || !store.get('supabaseUserId')) {
      console.log('[poll] Skipped — no supabase or userId')
      return
    }

    try {
      const userId = store.get('supabaseUserId')
      // console.log(`[poll] 🔍 Polling for userId: ${userId}`) // SILENCED

      // Process tag requests first (fast, no publishing)
      await processTagRequests()

      // Fetch pending publish jobs
      // console.log('[poll] 📬 Querying publish_jobs...') // SILENCED
      const { data: jobs, error } = await supabase
        .from('publish_jobs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5)

      if (error) {
        console.error('[poll] ❌ Supabase query error:', error)
        throw error
      }
      
      // Only log if we found jobs
      if (jobs && jobs.length > 0) {
        console.log(`[poll] 📊 Found ${jobs.length} pending jobs`)
        console.log('[poll] 🎯 Jobs to process:', jobs.map(j => ({ id: j.id, platforms: j.platforms, title: j.title })))
      }
      // else: Stay silent when no jobs (don't spam console)
      
      if (!jobs || jobs.length === 0) {
        // console.log('[poll] ✅ No pending jobs — waiting...') // SILENCED
        return
      }
      
      updateTrayMenu('running')

      for (const job of jobs) {
        await processJob(job)
      }

      updateTrayMenu('idle')
    } catch (err) {
      console.error('[poll] error:', err.message)
      updateTrayMenu('error')
    }
  }

  pollTimer = setInterval(poll, interval)
  poll() // run immediately on start
}

const { generateTagsLocalFromUrl } = require('./e621TaggerLocal')

// ── Tag requests polling ──────────────────────────────────────────────────────
async function processTagRequests() {
  if (!supabase || !store.get('supabaseUserId')) {
    // console.log('[tagReq] skipped — no supabase or userId') // SILENCED - demasiado spam
    return
  }
  try {
    const userId = store.get('supabaseUserId')

    const { data: requests, error } = await supabase
      .from('tag_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3)

    if (error) {
      console.error('[tagReq] ❌ SELECT error:', error.message, error.code)
      return
    }

    if (!requests || requests.length === 0) return

    // ── Log de requests encontrados ────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`[tagReq] 📬 ENCONTRADOS ${requests.length} TAG REQUESTS PENDIENTES`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    requests.forEach((req, i) => {
      const shortId = req.id.slice(0, 8)
      const shortUrl = req.image_url.slice(0, 60)
      console.log(`[tagReq]   ${i+1}. ID: ${shortId}... | Tagger: ${req.tagger_type?.toUpperCase() || 'WD'} | Imagen: ${shortUrl}...`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    for (const req of requests) {
      const taggerType = req.tagger_type || 'wd'
      
      // ── Log inicio de procesamiento ──────────────────────────────────
      console.log('╔═══════════════════════════════════════════════════════════╗')
      console.log(`║  PROCESANDO REQUEST: ${req.id.slice(0, 20)}...  ║`)
      console.log('╚═══════════════════════════════════════════════════════════╝')
      console.log(`[tagReq] 🤖 Tagger: ${taggerType.toUpperCase()}`)
      console.log(`[tagReq] 🖼️  Imagen: ${req.image_url}`)
      console.log(`[tagReq] 👤 User: ${userId.slice(0, 8)}...`)
      
      // HF token ya no se usa — el tagger es local
      
      // Marcar como processing
      console.log(`[tagReq] 📝 Actualizando status → 'processing' en Supabase...`)
      await supabase.from('tag_requests').update({ 
        status: 'processing', 
        updated_at: new Date().toISOString() 
      }).eq('id', req.id)
      console.log(`[tagReq] ✅ Status actualizado`)
      
      try {
        console.log(`[tagReq] 🚀 Llamando a ${taggerType.toUpperCase()}-Tagger...\n`)
        
        let tags
        const startTime = Date.now()
        
        // Todos los taggers usan JTP local (puerto 5621)
        // Para iniciar: cd joint-tagger/JTP_PILOT2 && python api_server.py
        console.log('[tagReq] 🤖 → Usando JTP PILOT2 local (http://localhost:5621)')
        tags = await generateTagsLocalFromUrl(req.image_url)
        
        const duration = Date.now() - startTime
        
        // ── Log de éxito ──────────────────────────────────────────────
        console.log('\n─────────────────────────────────────────────────────────────')
        console.log(`[tagReq] ✅ ${taggerType.toUpperCase()}-Tagger COMPLETADO`)
        console.log(`[tagReq] ⏱️  Tiempo total: ${(duration / 1000).toFixed(2)}s`)
        console.log(`[tagReq] 📊 Tags generados: ${tags.length}`)
        console.log(`[tagReq] 🏷️  Muestra (primeros 10):`)
        tags.slice(0, 10).forEach((tag, i) => {
          console.log(`[tagReq]      ${i+1}. ${tag}`)
        })
        if (tags.length > 10) {
          console.log(`[tagReq]      ... y ${tags.length - 10} más`)
        }
        console.log('─────────────────────────────────────────────────────────────')
        
        // Guardar en Supabase
        console.log(`[tagReq] 💾 Guardando ${tags.length} tags en Supabase...`)
        await supabase.from('tag_requests').update({ 
          status: 'done', 
          tags, 
          updated_at: new Date().toISOString() 
        }).eq('id', req.id)
        console.log(`[tagReq] ✅ Tags guardados en Supabase`)
        
        console.log('╔═══════════════════════════════════════════════════════════╗')
        console.log(`║         REQUEST ${req.id.slice(0, 8)}... COMPLETADO ✅         ║`)
        console.log('╚═══════════════════════════════════════════════════════════╝\n')
        
      } catch (err) {
        // ── Log de error ──────────────────────────────────────────────
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error(`[tagReq] ❌ ERROR EN REQUEST ${req.id.slice(0, 8)}...`)
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error(`[tagReq] 🤖 Tagger: ${taggerType.toUpperCase()}`)
        console.error(`[tagReq] 🖼️  Imagen: ${req.image_url}`)
        console.error(`[tagReq] 🔍 Error type: ${err.name || 'Error'}`)
        console.error(`[tagReq] 💬 Mensaje: ${err.message}`)
        
        // Diagnóstico de error común
        if (err.message.includes('401') || err.message.includes('unauthorized')) {
          console.error(`[tagReq] 🚫 CAUSA: Token HF inválido`)
          console.error(`[tagReq] 🔧 SOLUCIÓN: Ve a Settings → IAs & Taggers → actualiza token`)
        } else if (err.message.includes('429') || err.message.includes('rate limit')) {
          console.error(`[tagReq] ⚠️  CAUSA: Rate limit excedido`)
          console.error(`[tagReq] 🔧 SOLUCIÓN: Configura un token HF o espera unas horas`)
        } else if (err.message.includes('timeout')) {
          console.error(`[tagReq] ⏱️  CAUSA: Timeout - la request tardó demasiado`)
          console.error(`[tagReq] 🔧 SOLUCIÓN: Reintenta - el modelo puede estar en cold start`)
        } else if (err.message.includes('404') || err.message.includes('Not Found')) {
          console.error(`[tagReq] 🔍 CAUSA: Imagen no encontrada o URL inválida`)
          console.error(`[tagReq] 🔧 SOLUCIÓN: Verifica que la URL de la imagen sea accesible`)
        }
        
        console.error(`[tagReq] 📚 Stack trace:`)
        console.error(err.stack)
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        
        // Guardar error en Supabase
        console.log(`[tagReq] 💾 Guardando error en Supabase...`)
        await supabase.from('tag_requests').update({ 
          status: 'error', 
          error_msg: err.message, 
          updated_at: new Date().toISOString() 
        }).eq('id', req.id)
        console.log(`[tagReq] ✅ Error guardado en Supabase`)
        
        console.error('╔═══════════════════════════════════════════════════════════╗')
        console.error(`║          REQUEST ${req.id.slice(0, 8)}... FALLÓ ❌           ║`)
        console.error('╚═══════════════════════════════════════════════════════════╝\n')
      }
    }
  } catch (err) {
    console.error('[tagReq] ❌ Polling error:', err.message)
  }
}

// ── Process a single publish job ──────────────────────────────────────────────
async function processJob(job) {
  console.log(`[job] Processing job ${job.id} for platforms: ${job.platforms?.join(', ')}`)

  // Mark as running
  await supabase
    .from('publish_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)

  // ── Auto-generate tags with WD-Tagger if job has none ──────────────────────
  let jobTags = job.tags ?? []
  if (jobTags.length === 0 && job.image_url) {
    try {
      console.log('[job] No tags found — generating with JTP local...')
      jobTags = await generateTagsLocalFromUrl(job.image_url)
      console.log(`[job] JTP generated ${jobTags.length} tags`)
      // Save generated tags back to Supabase so the web app sees them
      await supabase
        .from('publish_jobs')
        .update({ tags: jobTags })
        .eq('id', job.id)
    } catch (err) {
      console.warn('[job] WD-Tagger failed:', err.message)
      // Not fatal — continue publishing without tags
    }
  }

  // Use generated tags for publishing
  const jobWithTags = { ...job, tags: jobTags }

  const results = []
  const errors  = []

  for (const platform of (job.platforms || [])) {
    try {
      console.log(`[job] 📤 Publishing to ${platform}...`)
      const result = await jobRunner.publishToPlatform(platform, jobWithTags)
      console.log(`[job] ✅ ${platform} success:`, result)
      results.push({ platform, ok: true, url: result?.url })
    } catch (err) {
      console.error(`[job] ❌ ${platform} failed:`, err.message, err.stack)
      errors.push({ platform, error: err.message })
    }
  }

  // Update job with results
  const allOk = errors.length === 0
  await supabase
    .from('publish_jobs')
    .update({
      status: allOk ? 'completed' : (results.length > 0 ? 'partial' : 'error'),
      completed_at: new Date().toISOString(),
      results,
      errors,
    })
    .eq('id', job.id)
}

// ── Local tag server (port 54322) ────────────────────────────────────────────
// The web app can call http://localhost:54322/tag to generate tags via WD-Tagger
// running locally on the artist's PC — no Cloudflare IP blocks.
function startTagServer() {
  const http = require('http')

  const server = http.createServer(async (req, res) => {
    // CORS — allow the Vercel app and localhost
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (req.method === 'POST' && req.url === '/tag') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', async () => {
        try {
          const { imageUrl, threshold = 0.35 } = JSON.parse(body)
          if (!imageUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'imageUrl required' }))
            return
          }
          const tags = await generateTagsLocalFromUrl(imageUrl)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, tags }))
        } catch (err) {
          console.error('[tagServer] error:', err.message)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'companion-tag-server' }))
      return
    }

    res.writeHead(404); res.end()
  })

  server.listen(54322, '127.0.0.1', () => {
    console.log('[tagServer] Listening on http://localhost:54322')
  })
  server.on('error', e => console.warn('[tagServer] error:', e.message))
}

// ── OAuth callback server ─────────────────────────────────────────────────────
// Listens on http://localhost:54321/auth/callback for the Google OAuth redirect.
// Extracts the session from the URL fragment and saves it to electron-store.

function startOAuthCallback() {
  const http = require('http')
  const { URL } = require('url')

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://localhost:54321')

    if (reqUrl.pathname !== '/auth/callback') {
      res.writeHead(404)
      res.end()
      return
    }

    // Serve a tiny HTML page that reads the hash fragment and posts it back
    // (hash fragments are not sent to the server — we need client-side JS)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Autenticando...</title></head>
<body style="font-family:sans-serif;background:#0f0f1a;color:#e0e0f0;padding:40px;text-align:center">
  <h2>✅ Iniciando sesión...</h2>
  <p>Puedes cerrar esta pestaña.</p>
  <script>
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const access_token  = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token) {
      fetch('http://localhost:54321/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, refresh_token })
      })
    }
  </script>
</body></html>`)
  })

  // Second handler: receive the tokens POSTed by the page above
  const sessionServer = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.includes('/auth/session')) {
      res.writeHead(404); res.end(); return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { access_token, refresh_token } = JSON.parse(body)
        if (access_token && supabase) {
          const { data } = await supabase.auth.setSession({
            access_token, refresh_token,
          })
          const userId = data?.user?.id
          if (userId) {
            store.set('supabaseUserId', userId)
            console.log('[oauth] Logged in as', userId)
          }
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
      } catch (e) {
        res.writeHead(500); res.end(e.message)
      }
    })
  })

  // Use a single server with dual routing
  const combined = http.createServer(async (req, res) => {
    // CORS for the page's fetch call
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const { URL } = require('url')
    const reqUrl = new URL(req.url, 'http://localhost:54321')

    if (reqUrl.pathname === '/auth/callback' && req.method === 'GET') {
      // Serve the hash-reader page
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Autenticando...</title></head>
<body style="font-family:sans-serif;background:#0f0f1a;color:#e0e0f0;padding:40px;text-align:center">
  <h2>✅ Sesión iniciada</h2><p>Puedes cerrar esta pestaña.</p>
  <script>
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const at = params.get('access_token')
    const rt = params.get('refresh_token')
    if (at) {
      fetch('/auth/session', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ access_token: at, refresh_token: rt })
      })
    }
  </script>
</body></html>`)
      return
    }

    if (reqUrl.pathname === '/auth/session' && req.method === 'POST') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', async () => {
        try {
          console.log('[oauth] 📨 Received session POST request')
          const { access_token, refresh_token } = JSON.parse(body)
          
          if (!access_token) {
            console.error('[oauth] ❌ No access_token in request body')
            res.writeHead(400); res.end('missing access_token')
            return
          }
          
          console.log('[oauth] 🔑 Access token received, setting session...')
          
          if (supabase) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
            
            if (error) {
              console.error('[oauth] ❌ setSession error:', error.message)
              res.writeHead(500); res.end(error.message)
              return
            }
            
            const userId = data?.user?.id
            const email = data?.user?.email
            const name = data?.user?.user_metadata?.full_name || data?.user?.user_metadata?.name
            
            if (userId) {
              store.set('supabaseUserId', userId)
              updateTrayMenu('idle')
              console.log('[oauth] ✅ Session saved successfully')
              console.log('[oauth] 👤 User:', { id: userId, email, name })
            } else {
              console.error('[oauth] ❌ No userId in session data')
            }
          } else {
            console.error('[oauth] ❌ Supabase client not available')
          }
          
          res.writeHead(200); res.end('ok')
        } catch (e) {
          console.error('[oauth] ❌ Exception in session handler:', e.message, e.stack)
          res.writeHead(500); res.end(e.message)
        }
      })
      return
    }

    res.writeHead(404); res.end()
  })

  combined.listen(54321, '127.0.0.1', () => {
    console.log('[oauth] callback server listening on http://localhost:54321')
  })

  combined.on('error', (e) => {
    // Port already in use — not fatal
    console.warn('[oauth] server error:', e.message)
  })
}

// ── Dev Tools / Log window ────────────────────────────────────────────────────
ipcMain.handle('get-logs', () => recentLogs)

// Keep last 100 log lines in memory
const recentLogs = []
const _origLog = console.log
const _origErr = console.error
const _origWarn = console.warn
function pushLog(level, args) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${level}: ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
  recentLogs.push(line)
  if (recentLogs.length > 200) recentLogs.shift()
}
console.log  = (...a) => { _origLog(...a);  pushLog('LOG',  a) }
console.error = (...a) => { _origErr(...a); pushLog('ERR',  a) }
console.warn  = (...a) => { _origWarn(...a); pushLog('WARN', a) }

// ── IPC handlers (for settings UI) ───────────────────────────────────────────
ipcMain.handle('get-config', () => {
  const pkg = require('../package.json')
  return { ...store.store, appVersion: pkg.version }
})

ipcMain.handle('save-config', (event, config) => {
  store.set(config)
  // Reinit supabase if credentials changed
  initSupabase()
  return { ok: true }
})

ipcMain.handle('test-platform', async (event, { platform, credentials }) => {
  if (!jobRunner) return { ok: false, error: 'Supabase no configurado' }
  return jobRunner.testPlatform(platform, credentials)
})

ipcMain.handle('get-status', async () => {
  let email = null
  let name = null
  if (supabase) {
    try {
      console.log('[getStatus] 🔍 Fetching user info from Supabase...')
      const { data, error } = await supabase.auth.getUser()
      
      if (error) {
        console.error('[getStatus] ❌ Error fetching user:', error.message)
      } else if (data?.user) {
        email = data.user.email ?? null
        // Try to get name from user_metadata (Google provides this)
        name = data.user.user_metadata?.full_name || 
               data.user.user_metadata?.name || 
               null
        console.log('[getStatus] ✅ User info:', { email, name, id: data.user.id })
      } else {
        console.log('[getStatus] ⚠️ No user data returned')
      }
    } catch (err) {
      console.error('[getStatus] ❌ Exception:', err.message)
    }
  } else {
    console.log('[getStatus] ⚠️ Supabase client not initialized')
  }
  
  const status = {
    connected: !!supabase,
    userId: store.get('supabaseUserId'),
    email,
    name,
    polling: !!pollTimer,
  }
  
  console.log('[getStatus] 📊 Returning status:', status)
  return status
})

// ── Google OAuth via Supabase ─────────────────────────────────────────────────
ipcMain.handle('google-login', async () => {
  console.log('[googleLogin] 🔑 Starting Google OAuth flow...')
  
  if (!supabase) {
    console.error('[googleLogin] ❌ Supabase not initialized')
    return { ok: false, error: 'Supabase no inicializado' }
  }

  try {
    console.log('[googleLogin] 📡 Calling signInWithOAuth...')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Opens in the system browser; Supabase redirects to a local callback
        redirectTo: 'http://localhost:54321/auth/callback',
        skipBrowserRedirect: false,
      },
    })

    if (error) {
      console.error('[googleLogin] ❌ OAuth error:', error.message)
      return { ok: false, error: error.message }
    }

    // Open the OAuth URL in the system browser
    if (data?.url) {
      console.log('[googleLogin] 🌐 Opening OAuth URL in browser:', data.url.substring(0, 50) + '...')
      shell.openExternal(data.url)
      console.log('[googleLogin] ✅ Browser opened, waiting for callback...')
      return { ok: true, pending: true }
    }

    console.error('[googleLogin] ❌ No OAuth URL generated')
    return { ok: false, error: 'No se generó URL de OAuth' }
  } catch (err) {
    console.error('[googleLogin] ❌ Exception:', err.message, err.stack)
    return { ok: false, error: err.message }
  }
})

// Called from settings UI after the browser redirects back with the session
ipcMain.handle('save-session', async (event, { accessToken, refreshToken, userId }) => {
  try {
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    }
    if (userId) {
      store.set('supabaseUserId', userId)
    }
    initSupabase()
    return { ok: true, userId }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('logout', async () => {
  try {
    if (supabase) await supabase.auth.signOut()
    store.set('supabaseUserId', '')
    initSupabase()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
