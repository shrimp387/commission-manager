/**
 * Store global de configuración visual de la app.
 * Persiste en localStorage bajo 'app_config'.
 */

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
