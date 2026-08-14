'use strict'

/**
 * e621TaggerLocal.js — Cliente para el servidor JTP PILOT2 local
 *
 * El modelo JTP corre en la PC del artista via api_server.py
 * Endpoint: http://localhost:5621/predict
 *
 * Para iniciar el servidor:
 *   cd joint-tagger/JTP_PILOT2
 *   python api_server.py
 */

const JTP_URL = 'http://127.0.0.1:5621'
const TIMEOUT_MS = 60_000  // 60s — la primera inferencia puede tardar

/**
 * Verifica si el servidor JTP local está corriendo.
 * @returns {Promise<boolean>}
 */
async function checkJTPStatus() {
  try {
    const res = await fetch(`${JTP_URL}/health`, {
      signal: AbortSignal.timeout(3000)
    })
    if (res.ok) {
      const data = await res.json()
      console.log(`[localTagger] ✅ Servidor JTP online: ${data.model}`)
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Genera tags enviando un buffer de imagen al servidor JTP local.
 *
 * @param {Buffer} imageBuffer
 * @param {number} threshold - default 0.2
 * @returns {Promise<string[]>}
 */
async function generateTagsLocal(imageBuffer, threshold = 0.2) {
  console.log(`[localTagger] 📤 Enviando imagen al servidor JTP (${imageBuffer.length} bytes)...`)

  const FormData = require('form-data')
  const form = new FormData()
  form.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' })
  form.append('threshold', String(threshold))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${JTP_URL}/predict`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`HTTP ${res.status}: ${err.error || ''}`)
    }

    const data = await res.json()
    console.log(`[localTagger] ✅ Tags generados: ${data.count}`)
    return data.tags

  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new Error(`Timeout esperando al servidor JTP (${TIMEOUT_MS / 1000}s)`)
    }
    throw err
  }
}

/**
 * Descarga imagen desde URL y genera tags con JTP local.
 *
 * @param {string} imageUrl
 * @param {number} threshold
 * @returns {Promise<string[]>}
 */
async function generateTagsLocalFromUrl(imageUrl, threshold = 0.2) {
  console.log(`[localTagger] ━━━━ JTP LOCAL TAGGER ━━━━`)
  console.log(`[localTagger] 🖼️  URL: ${imageUrl}`)
  console.log(`[localTagger] 🎯 Threshold: ${threshold}`)

  // Verificar que el servidor esté corriendo
  const online = await checkJTPStatus()
  if (!online) {
    throw new Error(
      'El servidor JTP local no está corriendo. ' +
      'Inícialo con: cd joint-tagger/JTP_PILOT2 && python api_server.py'
    )
  }

  // Descargar imagen
  console.log(`[localTagger] 📥 Descargando imagen...`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  let imageBuffer
  try {
    const res = await fetch(imageUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status} descargando imagen`)
    imageBuffer = Buffer.from(await res.arrayBuffer())
    console.log(`[localTagger] ✅ Imagen: ${imageBuffer.length} bytes`)
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout descargando imagen (60s)')
    throw err
  }

  return generateTagsLocal(imageBuffer, threshold)
}

module.exports = { generateTagsLocalFromUrl, checkJTPStatus }
