'use strict'

/**
 * hfHealthCheck.js — Valida que HuggingFace esté accesible y el token funcione
 * 
 * Ejecuta una prueba de conectividad al iniciar la companion app para detectar
 * problemas de configuración antes de que el usuario intente usar los taggers.
 */

const HEALTH_CHECK_TIMEOUT = 10000 // 10s timeout

/**
 * Prueba la conexión con HuggingFace Inference API
 * @param {string} hfToken - Token de HuggingFace (opcional)
 * @returns {Promise<{ok: boolean, status: string, error?: string, warning?: string}>}
 */
async function testHuggingFaceConnection(hfToken) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[hfHealthCheck] 🧪 VALIDANDO CONEXIÓN CON HUGGINGFACE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`[hfHealthCheck] 🔑 Token configurado: ${hfToken ? 'SÍ' : 'NO'}`)
  
  if (hfToken) {
    console.log(`[hfHealthCheck] 🔑 Token preview: ${hfToken.slice(0, 10)}...`)
    console.log(`[hfHealthCheck] 📏 Token length: ${hfToken.length} caracteres`)
  } else {
    console.log(`[hfHealthCheck] ⚠️  Sin token - Rate limiting activo (~100 requests/día)`)
    console.log(`[hfHealthCheck] 💡 Tip: Configura un token gratis en Settings → IAs & Taggers`)
  }
  
  try {
    const headers = {
      'User-Agent': 'CommissionManagerCompanion/1.8.0'
    }
    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`
    }
    
    // Test con un modelo público simple que siempre está disponible
    const testModel = 'SmilingWolf/wd-vit-tagger-v3'
    const url = `https://api-inference.huggingface.co/models/${testModel}`
    
    console.log(`[hfHealthCheck] 📡 Test endpoint: ${url}`)
    console.log(`[hfHealthCheck] 📤 Enviando GET request...`)
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)
    
    const startTime = Date.now()
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    })
    clearTimeout(timeout)
    
    const duration = Date.now() - startTime
    console.log(`[hfHealthCheck] 📥 Respuesta recibida: HTTP ${res.status}`)
    console.log(`[hfHealthCheck] ⏱️  Latencia: ${duration}ms`)
    
    // Leer el body para más detalles
    let body = null
    try {
      const text = await res.text()
      body = text ? JSON.parse(text) : null
    } catch (e) {
      // Ignore parse errors
    }
    
    // ── Casos de éxito ────────────────────────────────────────────────
    if (res.status === 200) {
      console.log(`[hfHealthCheck] ✅ CONEXIÓN EXITOSA`)
      console.log(`[hfHealthCheck] ✅ HuggingFace API está accesible`)
      if (hfToken) {
        console.log(`[hfHealthCheck] ✅ Token VÁLIDO y funcional`)
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      return { 
        ok: true, 
        status: 'connected',
        latency: duration
      }
    }
    
    // ── Token inválido ────────────────────────────────────────────────
    if (res.status === 401 || res.status === 403) {
      console.error(`[hfHealthCheck] ❌ ERROR: Token inválido o expirado`)
      console.error(`[hfHealthCheck] 💬 HTTP ${res.status}`)
      if (body?.error) {
        console.error(`[hfHealthCheck] 💬 Mensaje: ${body.error}`)
      }
      console.error(`[hfHealthCheck] 🔧 Solución: Ve a Settings → IAs & Taggers y actualiza el token`)
      console.error(`[hfHealthCheck] 🔗 Obtén un nuevo token en: https://huggingface.co/settings/tokens`)
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      return { 
        ok: false, 
        error: 'Token inválido o expirado', 
        status: 'unauthorized' 
      }
    }
    
    // ── Rate limit ────────────────────────────────────────────────────
    if (res.status === 429) {
      console.warn(`[hfHealthCheck] ⚠️  RATE LIMIT ACTIVO`)
      console.warn(`[hfHealthCheck] 📊 HTTP 429: Too Many Requests`)
      if (!hfToken) {
        console.warn(`[hfHealthCheck] 💡 Sin token: ~100 requests/día`)
        console.warn(`[hfHealthCheck] 🔧 Solución: Configura un token GRATIS para ~1,000 requests/día`)
      } else {
        console.warn(`[hfHealthCheck] ⚠️  Límite alcanzado incluso con token`)
        console.warn(`[hfHealthCheck] ⏰ Espera unas horas o usa otro token`)
      }
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      return { 
        ok: true,  // Still "ok" because it's just rate limited, not broken
        status: 'rate_limited', 
        warning: 'Rate limit activo - configura un token o espera' 
      }
    }
    
    // ── Modelo cargando ───────────────────────────────────────────────
    if (res.status === 503) {
      console.log(`[hfHealthCheck] ⏳ Modelo en cold start (503)`)
      console.log(`[hfHealthCheck] ℹ️  Esto es normal - el modelo se cargará cuando se use`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      return { 
        ok: true, 
        status: 'model_loading',
        warning: 'Modelo en cold start - se cargará cuando se use'
      }
    }
    
    // ── Otros errores ─────────────────────────────────────────────────
    console.warn(`[hfHealthCheck] ⚠️  Respuesta inesperada: HTTP ${res.status}`)
    if (body) {
      console.warn(`[hfHealthCheck] 💬 Body:`, JSON.stringify(body).slice(0, 200))
    }
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return { 
      ok: false, 
      error: `HTTP ${res.status}`, 
      status: 'unknown' 
    }
    
  } catch (err) {
    // ── Error de red/conexión ─────────────────────────────────────────
    console.error(`[hfHealthCheck] ❌ ERROR DE CONEXIÓN`)
    console.error(`[hfHealthCheck] 🔍 Tipo: ${err.name}`)
    console.error(`[hfHealthCheck] 💬 Mensaje: ${err.message}`)
    
    if (err.name === 'AbortError') {
      console.error(`[hfHealthCheck] ⏱️  TIMEOUT: No hubo respuesta en ${HEALTH_CHECK_TIMEOUT}ms`)
      console.error(`[hfHealthCheck] 🌐 Verifica tu conexión a internet`)
    } else {
      console.error(`[hfHealthCheck] 🌐 No se pudo conectar a HuggingFace`)
      console.error(`[hfHealthCheck] 🔍 Verifica: Firewall, antivirus, proxy, DNS`)
    }
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return { 
      ok: false, 
      error: err.message, 
      status: 'connection_failed' 
    }
  }
}

/**
 * Muestra un resumen visual del estado de HuggingFace
 */
function printHealthCheckSummary(result) {
  console.log('╔═══════════════════════════════════════════════╗')
  console.log('║     HUGGINGFACE API - HEALTH CHECK RESULT    ║')
  console.log('╚═══════════════════════════════════════════════╝')
  
  if (result.ok) {
    console.log('  ✅ Status: OPERACIONAL')
    if (result.status === 'connected') {
      console.log('  ✅ Conexión verificada')
      if (result.latency) {
        console.log(`  ⏱️  Latencia: ${result.latency}ms`)
      }
    }
    if (result.warning) {
      console.log(`  ⚠️  Advertencia: ${result.warning}`)
    }
  } else {
    console.log('  ❌ Status: ERROR')
    console.log(`  💬 ${result.error}`)
    console.log('  ')
    console.log('  🔧 Los taggers NO funcionarán hasta resolver esto.')
  }
  
  console.log('═══════════════════════════════════════════════\n')
}

module.exports = { 
  testHuggingFaceConnection,
  printHealthCheckSummary
}
