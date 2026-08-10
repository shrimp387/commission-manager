# Implementation Plan: Sticker System Improvements

## Overview

Mejoras evolutivas al sistema de stickers de Telegram integrado en la app React + Vite. Las modificaciones se concentran en cuatro archivos: `StickerPanel.jsx`, `EmojiReactions.jsx`, `global.css` y `ConnectionsPage.jsx` (sección `TelegramStickerManager`). No se introducen nuevas dependencias externas salvo `fast-check` para los tests de propiedad. El orden de implementación sigue las dependencias naturales: utilidades puras primero, luego componentes, y tests de propiedad en paralelo con los cambios que validan.

---

## Tasks

- [ ] 1. Crear función utilitaria `calcPopoverPosition` y actualizar CSS base
  - [ ] 1.1 Implementar `calcPopoverPosition(anchorRef, panelWidth?)` en `EmojiReactions.jsx`
    - Leer `--sidebar-w` con `getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')` (fallback 230)
    - Si `window.innerWidth < 600` → `effectiveWidth = window.innerWidth * 0.95`; sino `effectiveWidth = panelWidth` (default 320)
    - Calcular `left = Math.max(rect.left, SIDEBAR_W)`; si `left + effectiveWidth > window.innerWidth` recortar; segunda pasada con `Math.max(left, SIDEBAR_W)`
    - Detectar apertura hacia arriba: `openUpward = rect.bottom + 400 > window.innerHeight`
    - Devolver `{ left, top|bottom, width: effectiveWidth, openUpward }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.2 Escribir tests de propiedad para `calcPopoverPosition` (Properties 5, 6, 7)
    - **Property 5: El posicionamiento nunca solapa el sidebar**
    - **Property 6: El panel se invierte cuando hay poco espacio vertical**
    - **Property 7: El ancho se adapta a viewports pequeños**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
    - Archivo: `src/test/popover-position.property.test.js`
    - Usar `fc.integer` para simular posiciones de botón y tamaños de viewport; `numRuns: 100`

  - [ ] 1.3 Añadir reglas CSS en `global.css` para `.sticker-reaction`, `.sticker-item` y `.sticker-item img`
    - `.sticker-reaction`: `min-width: 36px; min-height: 36px; width: 36px; height: 36px; object-fit: contain`
    - `.sticker-item`: `min-width: 72px; min-height: 72px; width: 72px; height: 72px`
    - `.sticker-item img`: `object-fit: contain; width: 100%; height: 100%`
    - Botón `×` de reaction chip (`.sticker-delete-btn`): `min-width: 20px; min-height: 20px; opacity: 0; position: absolute; top: -4px; right: -4px`
    - `.reaction-chip:hover .sticker-delete-btn`: `opacity: 1`
    - `.reaction-chip`: añadir `position: relative`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.3, 8.6_

- [ ] 2. Actualizar `StickerPanel.jsx` — visualización progresiva y soporte de stickers animados
  - [ ] 2.1 Añadir estado `visibleCount` con reset al cambiar de tab en `StickerPanel.jsx`
    - Agregar `const [visibleCount, setVisibleCount] = useState(5)`
    - Añadir `useEffect(() => { setVisibleCount(5) }, [activeSetName])`
    - Derivar `visibleStickers = activeStickers.slice(0, visibleCount)` y `remaining = activeStickers.length - visibleCount`
    - Renderizar `visibleStickers` en el grid en lugar de `activeStickers`
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ] 2.2 Implementar botón "Ver más" y texto de conteo en `StickerPanel.jsx`
    - Renderizar debajo del grid: `{remaining > 0 && <button onClick={handleShowMore}>Ver más</button>}`
    - `handleShowMore`: `setVisibleCount(prev => prev + 10)`
    - Texto de conteo: `{remaining > 0 && <span>{visibleCount} de {activeStickers.length}</span>}`
    - Ocultar botón y texto cuando `remaining === 0`
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.7_

  - [ ]* 2.3 Escribir tests de propiedad para visualización progresiva (Properties 11, 12)
    - **Property 11: Visualización progresiva — límite inicial y reset**
    - **Property 12: Incremento correcto del "Ver más"**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.7**
    - Archivo: `src/test/sticker-panel.property.test.jsx`
    - Usar `fc.array(fc.string(), { minLength: 6, maxLength: 50 })` para simular listas de stickers

  - [ ] 2.4 Ampliar `StickerItem` para soporte de stickers animados (video y Lottie)
    - Añadir estado `videoUrl`, `videoError` a los existentes `imgError` y `thumbUrl`
    - Si `sticker.is_video`: resolver URL con `getTelegramFileUrl(token, sticker.file_id)` y guardar en `videoUrl`
    - Si `sticker.is_animated`: comprobar `customElements.get('lottie-player') !== undefined`
    - Lógica de renderizado:
      - `is_video && videoUrl && !videoError` → `<video autoPlay loop muted playsInline src={videoUrl} onError={() => setVideoError(true)} />`
      - `is_animated && lottieAvailable && videoUrl` → `<lottie-player src={videoUrl} autoplay loop />`
      - Fallback: `<img>` existente o emoji
    - Añadir `data-animated="true"` al `<button>` wrapper cuando `sticker.is_video || sticker.is_animated`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [ ]* 2.5 Escribir tests de propiedad para StickerItem animado (Properties 9, 10)
    - **Property 9: Stickers estáticos y de video usan elementos correctos**
    - **Property 10: Indicador `data-animated` presente en todos los stickers animados**
    - **Validates: Requirements 7.1, 7.4, 7.5**
    - Archivo: `src/test/sticker-item.property.test.jsx`

  - [ ]* 2.6 Escribir tests de ejemplo para StickerItem y visualización progresiva
    - Test: `is_animated` con `lottie-player` registrado renderiza `<lottie-player>`
    - Test: `is_animated` sin `lottie-player` muestra emoji fallback
    - Test: error de video muestra fallback estático
    - Archivo: `src/test/sticker-misc.example.test.jsx`
    - _Requirements: 7.2, 7.3_

- [ ] 3. Checkpoint — StickerPanel actualizado
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Actualizar `EmojiReactions.jsx` — posicionamiento, resolución de thumbUrl, hover/delete y video chips
  - [ ] 4.1 Reemplazar posicionamiento estático del popover por `calcPopoverPosition` en `EmojiReactions.jsx`
    - Añadir estado `const [popoverStyle, setPopoverStyle] = useState({})`
    - En `handleOpenStickers`: `setPopoverStyle(calcPopoverPosition(stickerBtnRef))` antes de `setShowStickers(true)`
    - Cambiar el div `.emoji-picker-popover` del sticker panel a `style={{ position: 'fixed', ...popoverStyle }}`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 4.2 Corregir resolución de `thumbUrl` en el handler `onSelect` de `EmojiReactions.jsx`
    - Reemplazar la lógica actual (`sticker.thumb?.file_path`) por `await getTelegramFileUrl(token, thumbFileId)`
    - Importar `getTelegramConfig` y `getTelegramFileUrl` de `../utils/telegram.js`
    - `thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id`
    - Si la resolución falla o el token está vacío, usar `sticker.emoji || '🖼'` como fallback
    - Incluir `is_video: sticker.is_video ?? false` en el objeto de reacción almacenado
    - Hacer el handler `onSelect` asíncrono (`async (sticker) => { ... }`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.3 Escribir tests de propiedad para persistencia y renderizado de sticker reactions (Properties 1, 2, 3, 4, 8)
    - **Property 1: Persistencia round-trip de `telegramStickerSets`**
    - **Property 2: Los tabs renderizados reflejan exactamente la lista guardada**
    - **Property 3: Invariante de no-duplicados al agregar un set**
    - **Property 4: Invariante de eliminación limpia**
    - **Property 8: Sticker reactions se renderizan siempre como `<img>` cuando `thumbUrl` es URL válida**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 3.1, 3.4, 3.5**
    - Archivo: `src/test/sticker-panel.property.test.jsx` (properties 1–4) y `src/test/emoji-reactions.property.test.jsx` (property 8)

  - [ ] 4.4 Añadir estado `hoveredKey` y `longPressKey` con botón `×` en chips de sticker en `EmojiReactions.jsx`
    - Añadir `const [hoveredKey, setHoveredKey] = useState(null)` y `const longPressTimer = useRef(null)`
    - En el chip de sticker: `onMouseEnter={() => setHoveredKey(k)}` y `onMouseLeave={() => setHoveredKey(null)}`
    - Renderizar `<button className="sticker-delete-btn" onClick={() => handleDeleteReaction(k)} aria-label="Eliminar reacción">×</button>` dentro del chip
    - Aplicar clase o estilo para mostrar/ocultar según `hoveredKey === k`
    - `handleDeleteReaction(key)`: construir `{ ...reactions }` sin la clave y llamar `onChange`
    - Long press táctil: `onTouchStart` inicia `setTimeout` 500ms → `setLongPressKey(k)`; `onTouchEnd/onTouchMove` cancela el timer
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 4.5 Renderizar video stickers en reaction chips en `EmojiReactions.jsx`
    - En el map de `stickerKeys`, si `val.is_video === true` y `val.thumbUrl?.startsWith('http')`: usar `<video autoPlay loop muted src={val.thumbUrl} className="sticker-reaction" />`
    - Sino: usar `<img>` existente
    - Ocultar `.reactions-summary` cuando no hay reacciones activas (`regularEmojis.length === 0 && stickerKeys` sin conteos > 0)
    - _Requirements: 3.1, 3.5, 7.5, 8.5_

  - [ ]* 4.6 Escribir tests de propiedad para hover/delete y video en EmojiReactions (Properties 13, 14)
    - **Property 13: El botón `×` aparece al hacer hover y desaparece al salir**
    - **Property 14: Eliminar una reacción produce un mapa sin esa clave**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
    - Archivo: `src/test/emoji-reactions.property.test.jsx`

  - [ ]* 4.7 Escribir tests de ejemplo para EmojiReactions
    - Test: imagen con `onError` muestra fallback emoji
    - Test: confirmación long-press 500ms muestra botón `×`
    - Test: botón `×` tiene área ≥ 20×20px (computed style)
    - Archivo: `src/test/sticker-misc.example.test.jsx`
    - _Requirements: 3.3, 8.4, 8.6_

- [ ] 5. Checkpoint — EmojiReactions actualizado
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Rediseñar `TelegramStickerManager` en `ConnectionsPage.jsx` con cards y confirmación de borrado
  - [ ] 6.1 Refactorizar el layout de `TelegramStickerManager` a grid de cards con previews y botón de eliminar al pie
    - Reemplazar el header con botón `✕` inline por una card con:
      - Título del set y conteo de stickers en el encabezado
      - Row de 3 thumbnails (primeros 3 stickers del set, resueltos con `getTelegramFileUrl`)
      - Botón "Eliminar" (`btn-danger`) al pie de la card, alineado a la derecha, área mínima 32×32px
    - Cuando `sets.length === 0`: mostrar solo `<p className="conn-empty">No tienes ningún sticker set guardado todavía.</p>`
    - El botón siempre visible en el DOM (no condicionado a hover)
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ] 6.2 Añadir confirmación `window.confirm` antes de eliminar en `TelegramStickerManager`
    - En `removeSet(name)`: `if (!window.confirm('¿Eliminar el set «' + name + '»?')) return`
    - Cancelar no modifica `appConfig` ni el estado local
    - Confirmar llama `setConfig` y `setSets` sincrónicamente
    - _Requirements: 4.2, 4.6_

  - [ ]* 6.3 Escribir tests de ejemplo para `TelegramStickerManager`
    - Test: confirmación cancelada no elimina el set
    - Test: confirmación aceptada elimina el set del DOM y de `appConfig`
    - Test: mensaje vacío cuando todos los sets son eliminados
    - Test: botón eliminar siempre en el DOM
    - Archivo: `src/test/sticker-manager.example.test.jsx`
    - _Requirements: 4.2, 4.4, 4.5, 4.6_

- [ ] 7. Añadir `fast-check` como dependencia de desarrollo e instalar
  - Ejecutar `npm install --save-dev fast-check` en la raíz del proyecto
  - Verificar que los archivos de test en `src/test/` son detectados por la config de Vitest existente
  - _Requirements: (infraestructura de tests)_

- [ ]* 8. Escribir tests de propiedad para tamaños mínimos CSS (Property 15)
  - **Property 15: Tamaños mínimos de sticker en CSS**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
  - Archivo: `src/test/emoji-reactions.property.test.jsx`
  - Inyectar las reglas CSS del paso 1.3 en JSDOM vía `@testing-library/react` y verificar `getComputedStyle` produce `min-width ≥ 36px` para `.sticker-reaction` y `min-width ≥ 72px` para `.sticker-item`

- [ ] 9. Final checkpoint — Todas las mejoras integradas y probadas
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Todos los tests de propiedad usan **fast-check** (`fc.assert`) con `{ numRuns: 100 }` y llevan el comentario `// Feature: sticker-system-improvements, Property N: <título>`
- Los archivos de test se ubican en `src/test/` siguiendo el patrón del proyecto
- `calcPopoverPosition` (tarea 1.1) debe estar disponible antes de modificar `EmojiReactions` (tarea 4.1)
- Las tareas 2.x (StickerPanel) y 4.x (EmojiReactions) son independientes entre sí y pueden ejecutarse en paralelo después de la tarea 1
- La tarea 7 (instalar `fast-check`) puede ejecutarse en paralelo con cualquier tarea de implementación, pero debe completarse antes de ejecutar los tests de propiedad

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "7"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "4.2", "6.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.3", "4.4", "6.2"] },
    { "id": 4, "tasks": ["2.5", "2.6", "4.5", "4.6", "6.3"] },
    { "id": 5, "tasks": ["4.7", "8"] }
  ]
}
```
