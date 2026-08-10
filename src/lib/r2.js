/**
 * r2.js — Cloudflare R2 Storage client via Worker proxy.
 *
 * The Worker handles authentication and communicates with R2.
 * Files are stored under: <userId>/<folder>/<filename>
 *
 * Usage:
 *   import { uploadToR2, deleteFromR2, getR2Url } from './r2.js'
 */
import { supabase } from './supabase.js'
import { getCurrentUserId } from './db.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Get the current Supabase JWT for authenticating with the Worker.
 */
async function getAuthToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

/**
 * Upload a File or Blob to R2.
 * @param {File|Blob} file
 * @param {string} folder — e.g. 'attachments', 'portfolio', 'backgrounds'
 * @param {string} [fileName] — optional custom filename
 * @returns {{ url: string, key: string } | null}
 */
export async function uploadToR2(file, folder, fileName = null) {
  if (!WORKER_URL) {
    console.warn('[r2] VITE_R2_WORKER_URL not set')
    return null
  }

  const userId = getCurrentUserId()
  if (!userId) {
    console.warn('[r2] No user logged in')
    return null
  }

  const token = await getAuthToken()
  if (!token) {
    console.warn('[r2] No auth token')
    return null
  }

  const ext = (fileName || file.name || 'file').split('.').pop()
  const name = fileName || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const path = `${userId}/${folder}/${name}`

  try {
    const res = await fetch(`${WORKER_URL}/upload/${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: file,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[r2] Upload failed:', err)
      return null
    }

    const data = await res.json()
    return { url: data.url, key: data.key }
  } catch (e) {
    console.error('[r2] Upload error:', e)
    return null
  }
}

/**
 * Delete a file from R2 by its storage key.
 * @param {string} key — the path returned by uploadToR2
 */
export async function deleteFromR2(key) {
  if (!WORKER_URL || !key) return

  const token = await getAuthToken()
  if (!token) return

  try {
    await fetch(`${WORKER_URL}/file/${key}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
  } catch (e) {
    console.warn('[r2] Delete error:', e)
  }
}

/**
 * Get the public URL for a file in R2.
 * Files served directly via the Worker (supports private buckets).
 */
export function getR2Url(key) {
  if (!WORKER_URL || !key) return null
  return `${WORKER_URL}/file/${key}`
}

/**
 * Check if R2 is configured and available.
 */
export function isR2Available() {
  return !!WORKER_URL && !!getCurrentUserId()
}
