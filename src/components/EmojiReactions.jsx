import { useState, useRef, useCallback } from 'react'
import EmojiPicker from './EmojiPicker.jsx'
import StickerPanel from './StickerPanel.jsx'
import { getTelegramConfig, getTelegramFileUrl } from '../utils/telegram.js'

const EMOJIS = ['👍','❤️','🔥','🎉','👀','✨','😂','🙌']

/**
 * Calculates popover position so it never overlaps the sidebar.
 * Returns a CSS style object for position:fixed container.
 */
function calcPopoverPosition(anchorRef, panelWidth = 320) {
  if (!anchorRef?.current) return { position: 'fixed', left: 0, top: 60, width: panelWidth, zIndex: 9999 }

  const rect = anchorRef.current.getBoundingClientRect()
  const sidebarW = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w') || '230', 10
  ) || 230

  const effectiveWidth = window.innerWidth < 600
    ? Math.floor(window.innerWidth * 0.95)
    : panelWidth

  let left = rect.left
  left = Math.max(left, sidebarW)
  if (left + effectiveWidth > window.innerWidth) left = window.innerWidth - effectiveWidth
  left = Math.max(left, sidebarW)

  const openUpward = rect.bottom + 420 > window.innerHeight

  if (openUpward) {
    return { position: 'fixed', left, bottom: window.innerHeight - rect.top + 4, width: effectiveWidth, zIndex: 9999 }
  }
  return { position: 'fixed', left, top: rect.bottom + 4, width: effectiveWidth, zIndex: 9999 }
}

export default function EmojiReactions({ reactions, onChange }) {
  const [showPicker, setShowPicker] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState({})
  const plusBtnRef = useRef(null)
  const stickerBtnRef = useRef(null)

  function toggle(emoji) {
    const count = reactions[emoji] || 0
    onChange({ ...reactions, [emoji]: count > 0 ? 0 : 1 })
  }

  function handleOpenStickers() {
    setPopoverStyle(calcPopoverPosition(stickerBtnRef, 320))
    setShowStickers(p => !p)
  }

  // Only regular emoji reactions shown inline — sticker overlays are rendered by CommissionRow
  const regularEmojis = EMOJIS.filter(e => reactions[e] > 0)
  const hasSummary = regularEmojis.length > 0

  return (
    <div className="subpanel" style={{ position: 'relative' }}>
      <p className="subpanel-title">Reacciones</p>
      <div className="emoji-grid">
        {EMOJIS.map(e => (
          <button
            key={e}
            className={`emoji-btn ${reactions[e] > 0 ? 'emoji-btn--active' : ''}`}
            onClick={() => toggle(e)}
            aria-label={`Reaccionar con ${e}`}
            aria-pressed={reactions[e] > 0}
          >
            {e}
            {reactions[e] > 0 && <span className="emoji-count">{reactions[e]}</span>}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem' }}>
        <button
          ref={plusBtnRef}
          className="emoji-add-btn"
          onClick={() => setShowPicker(p => !p)}
          aria-label="Más emojis"
          aria-expanded={showPicker}
        >＋</button>

        <button
          ref={stickerBtnRef}
          className="emoji-add-btn"
          onClick={handleOpenStickers}
          aria-label="Stickers de Telegram"
          aria-expanded={showStickers}
          title="Agregar sticker"
        >🎭</button>
      </div>

      {showPicker && (
        <div className="emoji-picker-popover">
          <EmojiPicker
            anchorRef={plusBtnRef}
            onSelect={(emoji) => {
              const count = reactions[emoji] || 0
              try { onChange({ ...reactions, [emoji]: count + 1 }) } catch {}
              setShowPicker(false)
            }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      {showStickers && (
        <div style={popoverStyle}>
          <StickerPanel
            anchorRef={stickerBtnRef}
            onSelect={async (sticker) => {
              const key = '__sticker__' + sticker.file_unique_id
              const cfg = getTelegramConfig()
              const token = cfg?.token || ''

              // Resolve thumbnail via getFile (file_id gives us the real CDN URL)
              const thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id
              let thumbUrl = null
              if (token && thumbFileId) {
                thumbUrl = await getTelegramFileUrl(token, thumbFileId)
              }
              // Last fallback: emoji glyph
              if (!thumbUrl || !thumbUrl.startsWith('http')) {
                thumbUrl = sticker.emoji || '🖼'
              }

              try {
                onChange({
                  ...reactions,
                  [key]: {
                    type: 'sticker',
                    file_id: sticker.file_id,
                    file_unique_id: sticker.file_unique_id,
                    is_video: sticker.is_video ?? false,
                    emoji: sticker.emoji ?? null,
                    thumbUrl,
                    count: (reactions[key]?.count || 0) + 1,
                  }
                })
              } catch {}
              setShowStickers(false)
            }}
            onClose={() => setShowStickers(false)}
          />
        </div>
      )}

      {hasSummary && (
        <div className="reactions-summary">
          {regularEmojis.map(e => (
            <span key={e} className="reaction-chip">{e} {reactions[e]}</span>
          ))}
        </div>
      )}
    </div>
  )
}
