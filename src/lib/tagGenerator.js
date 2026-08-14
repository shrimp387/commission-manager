/**
 * tagGenerator.js — Generación automática de tags estilo e621.
 *
 * Soporta múltiples backends:
 * - e621: zerauskii/e621-tagger-jtp via Companion App (flujo principal)
 * - pawfect: P.A.W.F.E.C.T-Alpha via Companion App (flujo principal)
 * - wd: WD-Tagger via Companion App (flujo principal)
 * - mistral: Mistral Pixtral (requiere plan de pago, directo desde browser)
 *
 * Flujo principal: Vercel → Supabase tag_requests → Companion App → HuggingFace
 * Fallback:        Vercel → HuggingFace directo desde browser (si companion no responde)
 */
import { getConfig } from '../store/appConfig.js'
import { generateTagsFromBrowser } from './huggingFaceClient.js'
import { requestTagsFromCompanion } from './tagRequestsDb.js'

const MAX_TAGS = 200

// ── Error ─────────────────────────────────────────────────────────────────────

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

export function normalizeTag(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(/\s+/g, '_')
}

export function identifyHighResAttachment(attachments) {
  if (!Array.isArray(attachments)) return null
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
  if (images.length === 0) return null
  return images.reduce((best, current) =>
    (current.size ?? 0) > (best.size ?? 0) ? current : best
  )
}

// ── Generación via Companion App (flujo principal) ──────────────────────────
// Companion App corre en Node.js → sin CORS, sin rate limits del browser
// Si la companion no está abierta, cae al fallback de browser

async function generateTagsViaCompanion(imageUrl, taggerType, hfToken, onStatus) {
  console.log(`[tagGenerator] 🖥️  Intentando via Companion App (${taggerType})...`)
  try {
    const tags = await requestTagsFromCompanion(imageUrl, taggerType, onStatus)
    console.log(`[tagGenerator] ✅ Companion App respondió: ${tags.length} tags`)
    return tags
  } catch (err) {
    // Si es timeout (companion no abierta), caer al browser
    if (err.message.includes('Timeout') || err.message.includes('autenticado')) {
      console.warn(`[tagGenerator] ⚠️  Companion no disponible: ${err.message}`)
      console.log(`[tagGenerator] 🌐 Fallback: llamando HuggingFace desde browser...`)
      onStatus?.('Companion App no disponible, generando desde browser...')
      return generateTagsFromBrowser(imageUrl, taggerType, hfToken, onStatus)
    }
    // Cualquier otro error (Supabase, etc.) también cae al browser
    console.warn(`[tagGenerator] ⚠️  Error companion: ${err.message} — usando browser`)
    return generateTagsFromBrowser(imageUrl, taggerType, hfToken, onStatus)
  }
}

// ── Mistral Vision ────────────────────────────────────────────────────────────

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

Rules: underscores instead of spaces, lowercase, 50-120 tags, no censoring NSFW.
Format: tag1, tag2, tag3, ...`

async function generateTagsMistral(imageUrl) {
  const cfg = getConfig()
  const mistralApiKey = cfg.mistralApiKey
  const mistralModel  = cfg.mistralModel || 'pixtral-large-latest'

  if (!mistralApiKey) throw new ConfigError('Configura tu API Key de Mistral en Conexiones → Mistral AI.')
  if (!VISION_MODELS.has(mistralModel)) throw new ConfigError(`El modelo "${mistralModel}" no soporta imágenes. Cambia a Pixtral.`)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS)

  try {
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralApiKey}` },
      body: JSON.stringify({
        model: mistralModel,
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'text', text: TAG_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ]}],
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error?.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return parseTags(data.choices?.[0]?.message?.content ?? '')
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout con Mistral')
    if (err instanceof ConfigError) throw err
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateTags(imageUrl, backend, onStatus) {
  const cfg = getConfig()
  const resolvedBackend = backend ?? cfg.tagBackend ?? 'e621'
  
  // Get HuggingFace token from config (used as fallback desde browser)
  const hfToken = cfg.hfToken || ''
  
  console.log('[tagGenerator] 🎯 Backend:', resolvedBackend)
  console.log('[tagGenerator] 🔑 HF Token:', hfToken ? 'present' : 'not set')
  console.log('[tagGenerator] 🖥️  Método: Companion App → fallback browser')
  
  if (resolvedBackend === 'mistral') {
    // Mistral siempre directo desde browser (no hay endpoint en companion)
    return generateTagsMistral(imageUrl)
  }
  
  // Para e621, pawfect, wd: intentar via companion app primero
  if (['e621', 'pawfect', 'wd'].includes(resolvedBackend)) {
    return generateTagsViaCompanion(imageUrl, resolvedBackend, hfToken, onStatus)
  }
  
  // Default: e621 via companion
  console.log('[tagGenerator] 🐾 Backend no reconocido, usando e621 via companion...')
  return generateTagsViaCompanion(imageUrl, 'e621', hfToken, onStatus)
}

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
