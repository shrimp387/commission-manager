/**
 * Given a Telegram file_id, returns the full CDN URL via getFile.
 * Caches results in memory to avoid repeated requests.
 */
const _fileUrlCache = new Map()

export async function getTelegramFileUrl(token, fileId) {
  if (!token || !fileId) return null
  const cacheKey = `${token}:${fileId}`
  if (_fileUrlCache.has(cacheKey)) return _fileUrlCache.get(cacheKey)

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    )
    const data = await res.json()
    if (data.ok && data.result?.file_path) {
      const url = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`
      _fileUrlCache.set(cacheKey, url)
      return url
    }
  } catch { /* fall through */ }

  return null
}

import { getCurrentUserId, getTelegramConfig as getTelegramConfigDb, saveTelegramConfig as saveTelegramConfigDb } from '../lib/db.js'

export function getTelegramConfig() {
  // Sync read from localStorage cache (set by db layer)
  const uid = getCurrentUserId() || localStorage.getItem('_current_user_id')
  const key = uid ? `telegram_config_${uid}` : 'telegram_config'
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

export async function saveTelegramConfig(token, chatId) {
  return saveTelegramConfigDb(token, chatId)
}

export async function sendTelegramNotification(request) {
  const config = getTelegramConfig()
  if (!config?.token || !config?.chatId) return { ok: false, reason: 'not_configured' }

  const { token, chatId } = config

  // Format message
  const budget = request.budgetMin
    ? `$${request.budgetMin}–$${request.budgetMax || '?'} USD`
    : 'No especificado'

  const text = [
    '🎨 *Nueva solicitud de comisión*',
    '',
    `👤 *Cliente:* ${request.name}`,
    `📧 *Correo:* ${request.email}`,
    request.social ? `🔗 *Redes:* ${request.social}` : null,
    `🖼 *Tipo de obra:* ${request.artworkType}`,
    `📝 *Descripción:* ${request.description.slice(0, 300)}${request.description.length > 300 ? '...' : ''}`,
    `💼 *Uso final:* ${request.usage}`,
    `💰 *Presupuesto:* ${budget}`,
    request.deadline ? `📅 *Fecha límite deseada:* ${request.deadline}` : null,
    `🖼 *Imágenes de referencia:* ${request.images?.length ?? 0}`,
    '',
    `🆔 *ID de solicitud:* \`${request.id}\``,
    `⏰ *Enviada:* ${new Date(request.createdAt).toLocaleString('es')}`,
  ].filter(Boolean).join('\n')

  try {
    // Send main message
    const msgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    )

    if (!msgRes.ok) {
      const err = await msgRes.json()
      return { ok: false, reason: err.description }
    }

    // Send reference images (max 5, independently)
    const images = request.images?.slice(0, 5) ?? []
    for (const img of images) {
      if (!img.url?.startsWith('data:')) continue
      // Convert base64 to blob for Telegram
      try {
        const blob = await (await fetch(img.url)).blob()
        const fd = new FormData()
        fd.append('chat_id', chatId)
        fd.append('photo', blob, img.name || 'referencia.jpg')
        fd.append('caption', `📎 Referencia: ${img.name}`)
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: fd,
        })
      } catch {
        // Continue even if one image fails
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

export async function testTelegramConnection(token, chatId) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ Conexión exitosa desde *Estudio de Comisiones*. ¡Tu bot está listo para recibir notificaciones!',
          parse_mode: 'Markdown',
        }),
      }
    )
    const data = await res.json()
    if (data.ok) return { ok: true }
    return { ok: false, reason: data.description }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}
