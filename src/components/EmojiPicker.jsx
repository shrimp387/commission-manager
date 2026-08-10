import { useState, useRef, useEffect, useDeferredValue, useCallback } from 'react';
import { EMOJI_CATEGORIES, ALL_EMOJIS } from '../data/emojis.js';
import { filterByCategory, searchEmojis } from '../utils/emojiUtils.js';

/**
 * EmojiPicker — standalone popover component.
 *
 * Props:
 *   onSelect(emoji: string) — called when an emoji is chosen
 *   onClose()               — called on outside click or Escape
 *   anchorRef               — ref to the element that triggers the picker (for positioning)
 */
export default function EmojiPicker({ onSelect, onClose, anchorRef }) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [searchText, setSearchText] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);

  const deferredSearch = useDeferredValue(searchText);
  const pickerRef = useRef(null);

  // Derive active emoji set
  const activeEmojis = deferredSearch
    ? searchEmojis(ALL_EMOJIS, deferredSearch)
    : filterByCategory(EMOJI_CATEGORIES, activeCategory);

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, anchorRef]);

  // Focus the correct grid button when focusIndex changes
  useEffect(() => {
    if (!pickerRef.current) return;
    const buttons = pickerRef.current.querySelectorAll('.emoji-grid-btn');
    if (buttons[focusIndex]) {
      buttons[focusIndex].focus();
    }
  }, [focusIndex]);

  // Reset focus index when emoji set changes
  useEffect(() => {
    setFocusIndex(0);
  }, [activeCategory, deferredSearch]);

  const handleSelect = useCallback(
    (emoji) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleGridKeyDown = useCallback(
    (e) => {
      const count = activeEmojis.length;
      if (count === 0) return;

      const COLS = 8;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusIndex((i) => Math.min(i + 1, count - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusIndex((i) => Math.max(i - 1, 0));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((i) => Math.min(i + COLS, count - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((i) => Math.max(i - COLS, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeEmojis[focusIndex]) {
            handleSelect(activeEmojis[focusIndex].emoji);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [activeEmojis, focusIndex, handleSelect, onClose]
  );

  return (
    <div className="emoji-picker" ref={pickerRef}>
      {/* Search */}
      <div className="emoji-picker-search">
        <input
          className="emoji-picker-search-input"
          type="text"
          placeholder="Buscar emoji..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          aria-label="Buscar emoji"
          autoFocus
        />
        {searchText && (
          <button
            className="emoji-picker-search-clear"
            onClick={() => setSearchText('')}
            aria-label="Limpiar búsqueda"
          >×</button>
        )}
      </div>

      {/* Category tabs — only visible when not searching */}
      {!deferredSearch && (
        <div className="emoji-picker-tabs" role="tablist" aria-label="Categorías de emoji">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`emoji-tab${activeCategory === cat.id ? ' emoji-tab--active' : ''}`}
              role="tab"
              aria-selected={activeCategory === cat.id}
              aria-label={cat.label}
              title={cat.label}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        className="emoji-picker-grid"
        role="grid"
        aria-label="Emojis"
        onKeyDown={handleGridKeyDown}
      >
        {activeEmojis.length > 0 ? (
          activeEmojis.map((item, idx) => (
            <button
              key={`${item.categoryId}-${item.emoji}-${idx}`}
              className="emoji-grid-btn"
              role="gridcell"
              aria-label={item.name}
              title={item.name}
              tabIndex={idx === focusIndex ? 0 : -1}
              onClick={() => handleSelect(item.emoji)}
            >
              {item.emoji}
            </button>
          ))
        ) : (
          <p className="emoji-picker-empty">
            {deferredSearch
              ? `Sin resultados para «${deferredSearch}»`
              : 'Sin emojis en esta categoría'}
          </p>
        )}
      </div>
    </div>
  );
}
