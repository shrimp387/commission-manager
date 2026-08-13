/**
 * tagGenerator.js — Generación automática de tags estilo e621.
 *
 * Backends disponibles:
 *   1. WD-Tagger (HuggingFace) — gratis, sin censura, especializado en arte furry/NSFW
 *   2. Mistral Vision (Pixtral) — requiere plan de pago, puede censurar NSFW
 *
 * Exports:
 *   normalizeTag(s)                        — función pura de normalización
 *   identifyHighResAttachment(attachments) — selecciona el adjunto imagen de mayor tamaño
 *   generateTags(imageUrl)                 — genera tags (usa WD-Tagger por defecto)
 *   parseTags(text)                        — parsea texto libre en array de tags normalizados
 *   ConfigError                            — error lanzado cuando falta configuración
 */
import { getConfig } from '../store/appConfig.js'

const MAX_TAGS = 200

// ── Error ─────────────────────────────────────────────────────────────────────

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza un tag al formato e621.
 */
export function normalizeTag(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Identifica el adjunto de imagen de mayor tamaño.
 */
export function identifyHighResAttachment(attachments) {
  if (!Array.isArray(attachments)) return null
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
  if (images.length === 0) return null
  return images.reduce((best, current) =>
    (current.size ?? 0) > (best.size ?? 0) ? current : best
  )
}

// ── WD-Tagger (via companion app local server OR R2 Worker proxy) ─────────────
// Priority 1: companion app running on localhost:54322 (no IP blocks, free)
// Priority 2: R2 Worker proxy → HuggingFace (may have 530 issues)

const COMPANION_TAG_URL = 'http://localhost:54322/tag'
const R2_WORKER_URL = 'https://commission-manager-r2.commission-manager-studio.workers.dev'
const WD_TIMEOUT_MS = 45_000
const WD_THRESHOLD  = 0.35

/**
 * Genera tags con WD-Tagger.
 * Intenta primero la companion app local, luego el worker de Cloudflare.
 */
async function generateTagsWDTagger(imageUrl) {
  // Obtenemos el token de Supabase del localStorage para autenticar con el worker
  let authToken = ''
  try {
    const session = JSON.parse(
      localStorage.getItem('sb-yhlhsqhlnzgrhagoeosp-auth-token') || '{}'
    )
    authToken = session?.access_token || ''
  } catch {}

  // ── Intento 1: companion app local ────────────────────────────────────────
  try {
    const localController = new AbortController()
    const localTimer = setTimeout(() => localController.abort(), 3000) // 3s timeout para detección rápida
    const localRes = await fetch(COMPANION_TAG_URL, {
      method: 'POST',
      signal: localController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, threshold: WD_THRESHOLD }),
    })
    clearTimeout(localTimer)

    if (localRes.ok) {
      const data = await localRes.json()
      if (data.ok && Array.isArray(data.tags)) {
        console.debug(`[WD-Tagger] companion local: ${data.tags.length} tags`)
        return data.tags
      }
    }
  } catch (err) {
    // Companion no está corriendo — fallback al worker
    console.debug('[WD-Tagger] companion not available, using worker:', err.message)
  }

  // ── Intento 2: R2 Worker proxy ────────────────────────────────────────────
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WD_TIMEOUT_MS)

  try {
    const res = await fetch(`${R2_WORKER_URL}/tag`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ imageUrl, threshold: WD_THRESHOLD }),
    })

    console.debug('[WD-Tagger] worker status:', res.status, res.statusText)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[WD-Tagger] worker error body:', body)
      if (res.status === 503 && body.error === 'model_loading') {
        throw new Error(body.message || 'WD-Tagger cargando, intenta en unos segundos')
      }
      if (res.status === 401) {
        throw new Error('No autorizado con el worker. Recarga la página e intenta de nuevo.')
      }
      throw new Error(body.error || `Error del servidor: HTTP ${res.status}`)
    }

    const data = await res.json()
    console.debug('[WD-Tagger] tags recibidos:', data.tags?.length ?? 0)
    if (!data.ok || !Array.isArray(data.tags)) {
      console.error('[WD-Tagger] respuesta inesperada:', data)
      throw new Error('Respuesta inesperada del servidor de tags')
    }

    return data.tags

  } catch (err) {
    clearTimeout(timer)
    console.error('[WD-Tagger] catch:', err.name, err.message)
    if (err.name === 'AbortError') throw new Error('Timeout al generar tags. Intenta de nuevo.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Mistral Vision (fallback) ─────────────────────────────────────────────────

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'
const MISTRAL_TIMEOUT_MS = 20_000

const VISION_MODELS = new Set(['pixtral-12b-2409', 'pixtral-large-latest'])

const TAG_PROMPT = `You are an expert e621 tagger. Analyze this artwork image in detail and generate as many accurate tags as possible in e621 format.

Return ONLY a comma-separated list of tags, nothing else. No explanations, no categories, just tags.

Include tags from these categories:
- species: all species present (e.g. fox, dragon, wolf, cat, human, anthro, feral)
- body: physical features (e.g. fur, scales, tail, ears, wings, claws, paws, mane)
- character: character names if recognizable
- gender: male, female, intersex, ambiguous_gender
- anatomy: body parts visible — be explicit and accurate
- sexual_acts: any sexual acts depicted — be explicit
- clothing: clothed, partially_clothed, nude, naked
- count: solo, duo, trio, group
- pose: standing, lying, sitting, on_all_fours, spread_legs, etc.
- expression: smile, blush, open_mouth, tongue_out, moaning, etc.
- setting: indoor, outdoor, bedroom, forest, etc.
- art_style: digital_art, traditional_art, sketch, watercolor, 3d_render, etc.
- quality: hi_res, absurd_res, detailed, shading, colored, etc.
- rating: rating:e (explicit), rating:q (questionable), rating:s (safe)

Rules:
- Use underscores instead of spaces
- Lowercase only
- Aim for 50-120 tags
- Do NOT censor NSFW content
- Format: tag1, tag2, tag3, ...`

async function generateTagsMistral(imageUrl) {
  const cfg = getConfig()
  const mistralApiKey = cfg.mistralApiKey
  const mistralModel  = cfg.mistralModel || 'pixtral-large-latest'

  if (!mistralApiKey) {
    throw new ConfigError(
      'Configura tu API Key de Mistral en Conexiones → Mistral AI y haz clic en Guardar.'
    )
  }

  if (!VISION_MODELS.has(mistralModel)) {
    throw new ConfigError(
      `El modelo "${mistralModel}" no soporta análisis de imágenes. Cambia a Pixtral en Conexiones → Mistral AI.`
    )
  }

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS)

  try {
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: mistralModel,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: TAG_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error?.message || `Error HTTP ${res.status}`)
    }

    const data = await res.json()
    const rawText = data.choices?.[0]?.message?.content ?? ''
    return parseTags(rawText)
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout al generar tags con Mistral')
    if (err instanceof ConfigError) throw err
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Genera tags automáticos estilo e621.
 * Usa WD-Tagger por defecto (gratis, sin censura).
 * Si el usuario tiene Mistral configurado con modelo Pixtral, lo usa como fallback o primario.
 *
 * @param {string} imageUrl — URL pública de la imagen
 * @param {'wdtagger'|'mistral'} [backend] — fuerza un backend específico
 * @returns {Promise<string[]>} array de tags normalizados (máx. 200)
 */
export async function generateTags(imageUrl, backend) {
  const cfg = getConfig()
  const resolvedBackend = backend ?? cfg.tagBackend ?? 'wdtagger'

  if (resolvedBackend === 'mistral') {
    return generateTagsMistral(imageUrl)
  }

  // WD-Tagger (default)
  return generateTagsWDTagger(imageUrl)
}

/**
 * Parsea texto libre en un array de tags normalizados.
 */
export function parseTags(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .split(/[,\n]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(normalizeTag)
    .filter(t => t.length > 0)
    .slice(0, MAX_TAGS)
}
