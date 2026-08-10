import { useState, useRef, useEffect, useCallback } from 'react';
import { getTelegramConfig, getTelegramFileUrl } from '../utils/telegram.js';
import { getConfig, setConfig } from '../store/appConfig.js';

/**
 * StickerPanel — Telegram sticker set popover.
 *
 * State machine:
 *   IDLE     → user types set name + clicks "Agregar" → LOADING
 *   LOADING  → API success                            → LOADED
 *   LOADING  → API error / not found                  → ERROR
 *   LOADED   → user clicks tab                        → LOADED (different set)
 *
 * Props:
 *   onSelect(sticker)  — called when user clicks a sticker item
 *   onClose()          — called on outside click or Escape
 *   anchorRef          — ref to the trigger element (excluded from outside-click)
 */
export default function StickerPanel({ onSelect, onClose, anchorRef }) {
  const panelRef = useRef(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('IDLE');         // 'IDLE' | 'LOADING' | 'LOADED' | 'ERROR'
  const [inputName, setInputName] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [missingToken, setMissingToken] = useState(false);
  const [loadedSets, setLoadedSets] = useState({});   // { [setName]: { title, stickers: [] } }
  const [activeSetName, setActiveSetName] = useState(null);

  // Persisted list of saved set names (from appConfig)
  const [savedSetNames, setSavedSetNames] = useState(() => getConfig().telegramStickerSets ?? []);

  // No progressive limit — show all stickers like Telegram does

  // ── On mount: check token ──────────────────────────────────────────────────
  useEffect(() => {
    const cfg = getTelegramConfig();
    if (!cfg?.token) {
      setMissingToken(true);
    }
  }, []);

  // ── Seed activeSetName once saved sets are available ──────────────────────
  useEffect(() => {
    if (savedSetNames.length > 0 && activeSetName === null) {
      setActiveSetName(savedSetNames[0]);
    }
  }, [savedSetNames, activeSetName]);

  // ── Close on outside click ─────────────────────────────────────────────────
  // Skip outside-click logic entirely when anchorRef is inside the panel
  // (inline mode used by TaskContextMenu's StickerSubPanel)
  useEffect(() => {
    function handleMouseDown(e) {
      if (!panelRef.current) return
      // If anchorRef is inside the panel (inline mode), don't use outside-click
      if (anchorRef?.current && panelRef.current.contains(anchorRef.current)) return
      if (panelRef.current.contains(e.target)) return
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, anchorRef]);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── fetchStickerSet ────────────────────────────────────────────────────────
  const fetchStickerSet = useCallback(async (name) => {
    const cfg = getTelegramConfig();
    const token = cfg?.token;

    if (!token) {
      setMissingToken(true);
      setPhase('IDLE');
      return;
    }

    setPhase('LOADING');
    setErrorMsg(null);

    let data = null;

    // 1. Try proxy first
    try {
      const proxyRes = await fetch('/proxy/telegram/getStickerSet?name=' + encodeURIComponent(name));
      if (proxyRes.ok) {
        data = await proxyRes.json();
      }
    } catch {
      // Proxy unavailable — fall through to direct call
    }

    // 2. Fall back to direct Telegram API call
    if (!data) {
      try {
        const directRes = await fetch(
          `https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(name)}`
        );
        data = await directRes.json();
      } catch {
        setPhase('ERROR');
        setErrorMsg('Error de red al contactar Telegram. Comprueba tu conexión.');
        return;
      }
    }

    // 3. Parse response
    if (!data?.ok) {
      setPhase('ERROR');
      const desc = data?.description ?? '';
      if (desc.toLowerCase().includes('not found') || desc.toLowerCase().includes('invalid')) {
        setErrorMsg(`No se encontró el set «${name}». Verifica el nombre e inténtalo de nuevo.`);
      } else {
        setErrorMsg(desc || 'Error al cargar el sticker set.');
      }
      return;
    }

    const result = data.result; // { name, title, stickers: [] }

    // 4. Store in-memory cache
    setLoadedSets(prev => ({
      ...prev,
      [result.name]: {
        title: result.title,
        stickers: result.stickers,
      },
    }));

    // 5. Persist set name in appConfig if not already saved
    const currentSaved = getConfig().telegramStickerSets ?? [];
    if (!currentSaved.includes(result.name)) {
      const updated = [...currentSaved, result.name];
      setConfig('telegramStickerSets', updated);
      setSavedSetNames(updated);
    }

    setActiveSetName(result.name);
    setPhase('LOADED');
    setInputName('');
  }, []);

  // ── Add set handler ────────────────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    const trimmed = inputName.trim();
    if (!trimmed || phase === 'LOADING') return;
    fetchStickerSet(trimmed);
  }, [inputName, phase, fetchStickerSet]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleAdd();
  }, [handleAdd]);

  // ── Remove saved set tab ───────────────────────────────────────────────────
  const handleRemoveSet = useCallback((nameToRemove, e) => {
    e.stopPropagation();
    const updated = savedSetNames.filter(n => n !== nameToRemove);
    setConfig('telegramStickerSets', updated);
    setSavedSetNames(updated);
    setLoadedSets(prev => {
      const copy = { ...prev };
      delete copy[nameToRemove];
      return copy;
    });
    if (activeSetName === nameToRemove) {
      setActiveSetName(updated[0] ?? null);
      setPhase(updated.length > 0 ? 'LOADED' : 'IDLE');
    }
  }, [savedSetNames, activeSetName]);

  // ── Switch tab ─────────────────────────────────────────────────────────────
  const handleTabClick = useCallback((name) => {
    setActiveSetName(name);
    setPhase('LOADED');
    // If not yet loaded in memory, fetch it (Req 1.6 — lazy fetch on tab click)
    if (!loadedSets[name]) {
      fetchStickerSet(name);
    }
  }, [loadedSets, fetchStickerSet]);

  // ── Sticker click ──────────────────────────────────────────────────────────
  // Note: onSelect may be async (e.g. when resolving thumbUrl via getFile).
  // We await it before calling onClose so the panel stays open during resolution.
  const handleStickerClick = useCallback(async (sticker) => {
    console.debug('[StickerPanel] sticker clicked:', {
      file_unique_id: sticker.file_unique_id,
      file_id: sticker.file_id,
      emoji: sticker.emoji,
      is_video: sticker.is_video,
      thumbnail: sticker.thumbnail,
      thumb: sticker.thumb,
    });
    await Promise.resolve(onSelect(sticker));
    onClose();
  }, [onSelect, onClose]);

  // ── Progressive display ────────────────────────────────────────────────────
  // (removed — all stickers shown at once like Telegram)

  // ── Derive active stickers ─────────────────────────────────────────────────
  const activeStickers = (activeSetName && loadedSets[activeSetName])
    ? loadedSets[activeSetName].stickers
    : [];

  const visibleStickers = activeStickers; // show all
  const showMoreBtn = false;

  // ── Keyboard navigation for the sticker grid ───────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const GRID_COLS = 4;

  // Reset focus when the active set changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [activeSetName]);

  const handleGridKeyDown = useCallback((e) => {
    if (activeStickers.length === 0) return;

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < 0 ? 0 : Math.min(prev + 1, activeStickers.length - 1);
          return next;
        });
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < 0 ? 0 : Math.max(prev - 1, 0);
          return next;
        });
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < 0 ? 0 : Math.min(prev + GRID_COLS, activeStickers.length - 1);
          return next;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < 0 ? 0 : Math.max(prev - GRID_COLS, 0);
          return next;
        });
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < activeStickers.length) {
          handleStickerClick(activeStickers[focusedIndex]);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        onClose();
        break;
      }
      default:
        break;
    }
  }, [activeStickers, focusedIndex, handleStickerClick, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="sticker-panel" ref={panelRef} role="dialog" aria-label="Panel de stickers">
      {missingToken ? (
        <p className="sticker-panel-notice">
          Configura tu Bot Token de Telegram en Conexiones antes de usar stickers.
        </p>
      ) : (
        <>
          {/* Add set input row */}
          <div className="sticker-panel-add">
            <input
              className="sticker-panel-input"
              type="text"
              placeholder="Nombre del set (ej: Animals)"
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              onKeyDown={handleInputKeyDown}
              aria-label="Nombre del sticker set"
              disabled={phase === 'LOADING'}
            />
            <button
              className="btn-sm-primary"
              onClick={handleAdd}
              disabled={phase === 'LOADING' || inputName.trim() === ''}
              aria-label="Agregar sticker set"
            >
              Agregar
            </button>
          </div>

          {/* Loading spinner */}
          {phase === 'LOADING' && (
            <div className="sticker-spinner-wrap">
              <div className="mini-spinner" role="status" aria-label="Cargando stickers…" />
            </div>
          )}

          {/* Error message */}
          {phase === 'ERROR' && errorMsg && (
            <p className="sticker-panel-error" role="alert">{errorMsg}</p>
          )}

          {/* Tabs — one per saved set name */}
          {savedSetNames.length > 0 && (
            <div className="sticker-panel-tabs" role="tablist" aria-label="Sticker sets guardados">
              {savedSetNames.map(name => {
                const setData = loadedSets[name];
                const label = setData?.title ?? name;
                const isActive = name === activeSetName;
                return (
                  <button
                    key={name}
                    className={`sticker-tab${isActive ? ' sticker-tab--active' : ''}`}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTabClick(name)}
                    title={label}
                  >
                    <span className="sticker-tab-label">{label}</span>
                    <span
                      className="sticker-tab-remove"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRemoveSet(name, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRemoveSet(name, e); }}
                      aria-label={`Eliminar set ${label}`}
                      title="Eliminar set"
                    >
                      ×
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sticker grid — all stickers, scrollable like Telegram */}
          {(phase === 'LOADED' || (savedSetNames.length > 0 && activeStickers.length > 0)) && (
            <div
              className="sticker-panel-grid"
              role="grid"
              aria-label="Stickers"
              tabIndex={0}
              onKeyDown={handleGridKeyDown}
            >
              {activeStickers.map((sticker, idx) => (
                <StickerItem
                  key={sticker.file_unique_id}
                  sticker={sticker}
                  onClick={handleStickerClick}
                  focused={idx === focusedIndex}
                />
              ))}
            </div>
          )}

          {/* Empty state when sets saved but none loaded yet */}
          {savedSetNames.length > 0 && activeStickers.length === 0 && phase === 'IDLE' && (
            <p className="sticker-panel-notice" style={{ marginTop: '0.5rem' }}>
              Haz clic en un tab para cargar sus stickers.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── StickerItem sub-component ──────────────────────────────────────────────────
// Videos play on hover (Telegram-style), not autoPlay — avoids lagging with many items.
// Double-click pins continuous playback.
function StickerItem({ sticker, onClick, focused }) {
  const [imgError, setImgError] = useState(false);
  const [thumbUrl, setThumbUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const btnRef = useRef(null);
  const videoRef = useRef(null);

  const cfg = getTelegramConfig();
  const token = cfg?.token;

  const isAnimated = sticker.is_animated ?? false;
  const isVideo = sticker.is_video ?? false;
  const isAnimatedSticker = isVideo || isAnimated;

  // Always resolve thumbnail (static preview)
  useEffect(() => {
    const thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id;
    if (!token || !thumbFileId) return;
    let cancelled = false;
    getTelegramFileUrl(token, thumbFileId).then(url => {
      if (!cancelled && url) setThumbUrl(url);
    });
    return () => { cancelled = true; };
  }, [token, sticker.thumbnail?.file_id, sticker.thumb?.file_id]);

  // Resolve video URL lazily — only on first hover to avoid mass API calls
  const videoUrlFetched = useRef(false);
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (isVideo && token && sticker.file_id && !videoUrlFetched.current) {
      videoUrlFetched.current = true;
      getTelegramFileUrl(token, sticker.file_id).then(url => {
        if (url) setVideoUrl(url);
      });
    }
    if (isVideo && videoRef.current && videoUrl && !pinned) {
      videoRef.current.play().catch(() => {});
    }
  }, [isVideo, token, sticker.file_id, videoUrl, pinned]);

  // Play once videoUrl resolves and we're still hovering
  useEffect(() => {
    if (videoUrl && hovered && videoRef.current && !pinned) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoUrl, hovered, pinned]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (isVideo && videoRef.current && !pinned) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isVideo, pinned]);

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    if (!isVideo) return;
    const next = !pinned;
    setPinned(next);
    if (videoRef.current) {
      if (next) videoRef.current.play().catch(() => {});
      else { videoRef.current.pause(); videoRef.current.currentTime = 0; }
    }
  }, [isVideo, pinned]);

  // Move native focus to the button when keyboard-focused
  useEffect(() => {
    if (focused && btnRef.current) {
      btnRef.current.focus();
    }
  }, [focused]);

  const lottieAvailable = typeof customElements !== 'undefined'
    && customElements.get('lottie-player') !== undefined;

  function renderMedia() {
    // Video sticker: show static thumb until hover, then switch to video
    if (isVideo) {
      return (
        <>
          {/* Static thumbnail — shown when not hovered */}
          {thumbUrl && !imgError && !hovered && (
            <img
              src={thumbUrl}
              alt={sticker.emoji ?? 'sticker'}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: (hovered && videoUrl) ? 'none' : 'block' }}
            />
          )}
          {/* Video — always rendered but only plays on hover */}
          {videoUrl && !videoError && (
            <video
              ref={videoRef}
              src={videoUrl}
              loop
              muted
              playsInline
              preload="metadata"
              onError={() => setVideoError(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                display: (hovered || pinned) ? 'block' : 'none'
              }}
            />
          )}
          {/* Fallback if video errors and no thumb */}
          {(videoError || (!thumbUrl && !videoUrl)) && (
            <span aria-hidden="true" style={{ fontSize: '1.75rem', lineHeight: 1 }}>
              {sticker.emoji ?? '🖼'}
            </span>
          )}
        </>
      );
    }

    // Lottie/TGS
    if (isAnimated && lottieAvailable && thumbUrl) {
      return (
        // eslint-disable-next-line react/no-unknown-property
        <lottie-player src={thumbUrl} autoplay loop style={{ width: '100%', height: '100%' }} />
      );
    }

    // Static image
    if (thumbUrl && !imgError) {
      return (
        <img
          src={thumbUrl}
          alt={sticker.emoji ?? 'sticker'}
          onError={() => setImgError(true)}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      );
    }

    return (
      <span aria-hidden="true" style={{ fontSize: '1.75rem', lineHeight: 1 }}>
        {sticker.emoji ?? '🖼'}
      </span>
    );
  }

  return (
    <button
      ref={btnRef}
      className={`sticker-item${pinned ? ' sticker-item--pinned' : ''}`}
      role="gridcell"
      aria-label={sticker.emoji ? `Sticker ${sticker.emoji}` : 'Sticker'}
      title={isVideo ? (pinned ? 'Doble clic para pausar' : 'Hover para ver · Doble clic para fijar') : (sticker.emoji ?? sticker.file_unique_id)}
      onClick={() => onClick(sticker)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      tabIndex={focused ? 0 : -1}
    >
      {renderMedia()}
      {pinned && (
        <span className="sticker-item-pinned-dot" aria-hidden="true" title="Reproducción fija">●</span>
      )}
    </button>
  );
}
