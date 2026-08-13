/**
 * Store global de configuración visual de la app.
 * Persiste en localStorage bajo 'app_config' Y en Supabase (tabla profiles).
 */
import { updateProfile } from '../lib/db.js'

const LS_KEY = 'app_config'

const DEFAULTS = {
  // Proyecto
  projectName: 'Estudio de Comisiones',
  projectSubtitle: 'De la idea a la entrega',
  projectIcon: '🔭',
  projectBannerUrl: '',
  projectBannerColor: '',

  // Fondo global
  globalBgUrl: '',
  globalBgOpacity: 0.85,

  // Tipografía
  fontFamily: 'Inter',
  fontSize: 14,

  // Color de acento
  accentColor: '#22C55E',

  // Fondos por sección/página
  // Shape: { [pageId: string]: { url: string, transform: CropTransform } }
  // CropTransform: { x: number, y: number, scale: number, width: number, height: number }
  sectionBgs: {},

  // Íconos por sección
  sectionIcons: {},

  // Orden de tarjetas por sección (drag reordenar)
  cardOrder: {},

  // Ancho del sidebar en píxeles (Requirement 2)
  sidebarWidth: 230,

  // Nombres de Sticker Sets de Telegram guardados (Requirement 4)
  telegramStickerSets: [],

  // Mistral API key for NSFW-aware tag generation
  mistralApiKey: '',

  // Mistral model selection
  mistralModel: 'pixtral-large-latest',

  // Tag generation backend: 'e621' (Poofy1, default) | 'pawfect' (FurAffinity) | 'mistral'
  tagBackend: 'e621',
}

let _config = { ...DEFAULTS }
const _listeners = new Set()

try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  _config = { ...DEFAULTS, ...saved }
} catch {}

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(_config))
  _listeners.forEach(fn => fn({ ..._config }))
  // Sync to Supabase (fire and forget)
  syncToSupabase()
}

// Debounce Supabase writes to avoid hammering on rapid changes (e.g. color picker drag)
let _syncTimer = null
function syncToSupabase() {
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(async () => {
    try {
      await updateProfile({
        project_name: _config.projectName,
        project_subtitle: _config.projectSubtitle,
        project_icon: _config.projectIcon,
        project_banner_url: _config.projectBannerUrl,
        accent_color: _config.accentColor,
        font_family: _config.fontFamily,
        font_size: _config.fontSize,
        global_bg_url: _config.globalBgUrl,
        global_bg_opacity: _config.globalBgOpacity,
        sidebar_width: _config.sidebarWidth,
        section_bgs: _config.sectionBgs,
        section_icons: _config.sectionIcons,
        telegram_sticker_sets: _config.telegramStickerSets,
        mistral_api_key: _config.mistralApiKey,
        mistral_model: _config.mistralModel,
      })
    } catch (e) {
      // Supabase not ready or offline — localStorage is the fallback
      console.warn('[appConfig] Supabase sync failed (offline?):', e?.message)
    }
  }, 800) // wait 800ms after last change before writing
}

export function getConfig() { return { ..._config } }

export function setConfig(key, value) {
  _config[key] = value
  save()
  applyConfig()
}

export function setConfigMulti(updates) {
  Object.assign(_config, updates)
  save()
  applyConfig()
}

export function subscribeConfig(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * Called by AuthContext after seeding profile from Supabase.
 * Reloads app_config from localStorage into the in-memory singleton.
 */
export function reloadConfigFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    _config = { ...DEFAULTS, ...saved }
    _listeners.forEach(fn => fn({ ..._config }))
    applyConfig()
  } catch {}
}

// Apply CSS variables globally
export function applyConfig() {
  const root = document.documentElement
  root.style.setProperty('--green', _config.accentColor)
  root.style.setProperty('--font-family', _config.fontFamily + ', Inter, system-ui, sans-serif')
  root.style.setProperty('--sidebar-w', _config.sidebarWidth + 'px')
  root.style.fontSize = _config.fontSize + 'px'

  // Global background — ahora manejado por usePageBackground hook
  // Mantenemos la clase para compatibilidad con estilos del sidebar
  const appEl = document.querySelector('.app-shell')
  if (appEl) {
    if (_config.globalBgUrl) {
      appEl.classList.add('has-bg-image')
    } else {
      appEl.classList.remove('has-bg-image')
    }
  }
}

// Apply on import
applyConfig()
