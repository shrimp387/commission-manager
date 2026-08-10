# Requirements Document

## Introduction

Esta especificación cubre las mejoras al sistema de stickers de Telegram integrado en la aplicación de gestión de comisiones artísticas (estilo Taskade). El sistema actual presenta problemas de persistencia, renderizado, posicionamiento del panel y falta de funcionalidades de UX. Los requisitos abordan ocho áreas de mejora identificadas mediante capturas de pantalla y análisis del código fuente (React + Vite).

Los componentes afectados son: `StickerPanel.jsx`, `EmojiReactions.jsx`, `ConnectionsPage.jsx` (sección `TelegramStickerManager`), `global.css`, y el store `appConfig.js`.

---

## Glossary

- **Sticker_Set**: Colección de stickers de Telegram identificada por un nombre único (e.g. `Animals`).
- **Sticker**: Imagen individual dentro de un Sticker_Set. Puede ser estática (`.webp`), animada en formato Lottie (`.tgs`) o en video (`.webm`).
- **StickerPanel**: Componente React popover que permite al usuario buscar y seleccionar stickers para agregar como reacción a una comisión.
- **EmojiReactions**: Componente React que muestra las reacciones (emojis y stickers) de una comisión y permite agregar nuevas.
- **StickerManager**: Sección de la página de Conexiones (`ConnectionsPage`) donde el usuario administra los Sticker_Sets guardados.
- **appConfig**: Store de configuración global que persiste datos en `localStorage` bajo la clave `app_config`.
- **telegramStickerSets**: Campo de `appConfig` que almacena la lista de nombres de Sticker_Sets guardados.
- **Reaction_Key**: Clave única en el mapa de reacciones de una comisión, con prefijo `__sticker__` seguido del `file_unique_id`.
- **Viewport**: Área visible del navegador excluyendo el sidebar izquierdo y cualquier panel lateral abierto.
- **Thumbnail_URL**: URL de la imagen de vista previa de un sticker, obtenida a través de la API `getFile` de Telegram.
- **TGS**: Formato propietario de Telegram para stickers animados basado en Lottie JSON comprimido con gzip.
- **WEBM**: Formato de video web; usado por Telegram para stickers animados en video.

---

## Requirements

### Requirement 1: Persistencia de Sticker Sets en localStorage

**User Story:** Como usuaria de la app, quiero que los sticker sets que agrego en el StickerPanel se mantengan disponibles después de refrescar la página, para no tener que agregarlos de nuevo cada sesión.

#### Acceptance Criteria

1. WHEN el StickerPanel se monta, THE StickerPanel SHALL leer `appConfig.telegramStickerSets` y renderizar un tab por cada nombre guardado, usando el título resuelto del set si está disponible en caché o el nombre raw como fallback; el primer tab de la lista SHALL quedar activo por defecto.
2. WHEN el usuario agrega un Sticker_Set exitosamente (respuesta `ok: true` de la API), THE StickerPanel SHALL llamar a `setConfig('telegramStickerSets', updatedArray)` con el nuevo nombre incluido, siempre que ese nombre no exista ya en el array, para evitar duplicados.
3. WHEN el usuario elimina un Sticker_Set, THE StickerPanel SHALL llamar a `setConfig('telegramStickerSets', filteredArray)` donde `filteredArray` excluye únicamente el nombre eliminado, sin modificar el orden ni los demás elementos.
4. WHEN la aplicación se inicializa, THE appConfig SHALL leer el valor de `localStorage` bajo la clave `app_config` y, si contiene el campo `telegramStickerSets`, exponerlo a través de `getConfig()` de modo que el valor sea idéntico al que fue escrito con `setConfig` en la sesión anterior.
5. IF `localStorage` no contiene el campo `telegramStickerSets`, THEN THE StickerPanel SHALL tratar `telegramStickerSets` como un array vacío y no renderizar ningún tab ni mostrar ningún error.
6. WHEN el usuario hace clic en un tab de un Sticker_Set guardado cuyos stickers no están en memoria (por ejemplo tras una recarga), THE StickerPanel SHALL llamar automáticamente a `fetchStickerSet(name)` para obtener los stickers de ese set antes de intentar renderizar la grilla.

---

### Requirement 2: Posicionamiento del StickerPanel sin solapamiento con el sidebar

**User Story:** Como usuaria, quiero que el panel de stickers sea completamente visible al abrirlo desde el menú de reacciones, sin que el sidebar izquierdo lo tape parcialmente.

#### Acceptance Criteria

1. WHEN el StickerPanel se renderiza como popover, THE StickerPanel SHALL posicionarse de modo que su borde izquierdo sea mayor o igual a 230px desde el borde izquierdo del viewport (`window.innerWidth` base), y ningún pixel del panel quede fuera de los límites del viewport en ninguno de sus cuatro lados.
2. WHEN el StickerPanel calcula su posición horizontal, THE StickerPanel SHALL usar `stickerBtnRef.current.getBoundingClientRect().left` como punto de anclaje izquierdo, y limitar su ancho al espacio disponible entre ese punto y `window.innerWidth`.
3. WHEN `window.innerWidth` es menor de 600px, THE StickerPanel SHALL ajustar su ancho al 95% de `window.innerWidth` en lugar de usar su ancho fijo de 320px.
4. IF el borde izquierdo calculado del `.emoji-picker-popover` es menor a 230px (ancho del sidebar definido por `var(--sidebar-w)`), THEN THE EmojiReactions SHALL desplazar el popover hacia la derecha hasta que su borde izquierdo sea exactamente `var(--sidebar-w)`.
5. IF `anchorEl.getBoundingClientRect().bottom + 400 > window.innerHeight`, THEN THE StickerPanel SHALL abrirse hacia arriba desde el botón de anclaje, de modo que el borde inferior del panel coincida con el borde superior del botón de anclaje.

---

### Requirement 3: Renderizado correcto de stickers en el panel de reacciones

**User Story:** Como usuaria, quiero ver la imagen real de cada sticker en la sección de reacciones de una tarjeta de comisión, en lugar de texto roto como "sticker 1" o íconos rotos.

#### Acceptance Criteria

1. WHEN una reacción de tipo sticker existe en el mapa de reacciones de una comisión, THE EmojiReactions SHALL renderizar la imagen del sticker usando el `thumbUrl` almacenado en el objeto de reacción mediante un elemento `<img>`.
2. IF el campo `thumbUrl` no está presente en el objeto de reacción, THEN THE EmojiReactions SHALL mostrar el valor del campo `emoji` del objeto de reacción como fallback; IF el campo `emoji` tampoco está presente, THEN THE EmojiReactions SHALL mostrar el glifo `🖼` en su lugar, sin renderizar ningún texto tipo "sticker N".
3. IF la carga de la imagen `thumbUrl` falla (evento `error` del `<img>`), THEN THE EmojiReactions SHALL mostrar el emoji de fallback del sticker o el glifo `🖼` en su lugar; IF la URL no es recuperable desde la API `getFile` de Telegram durante el proceso de adición, THEN THE EmojiReactions SHALL almacenar el campo `emoji` del sticker como valor de `thumbUrl`.
4. THE EmojiReactions SHALL distinguir reacciones de tipo sticker (claves con prefijo `__sticker__`) de reacciones de emoji normales y renderizarlas exclusivamente con el componente `<img>` correspondiente.
5. THE EmojiReactions SHALL renderizar la imagen del sticker mediante un `<img>` con `src` igual a `thumbUrl` cuando dicho campo sea un string que comience con `http`; en caso contrario, SHALL mostrar el valor de `thumbUrl` como texto emoji o el glifo `🖼` como fallback.

---

### Requirement 4: Botón de eliminar sticker set en el StickerManager

**User Story:** Como usuaria, quiero poder eliminar sticker sets desde la sección de configuración de stickers, mediante un botón claramente visible al final o debajo de cada card de sticker set.

#### Acceptance Criteria

1. THE StickerManager SHALL mostrar un botón de eliminar para cada Sticker_Set guardado, posicionado al pie de la card del set, debajo de la fila de previews de stickers y alineado al borde derecho de la card.
2. WHEN el usuario hace clic en el botón de eliminar de un Sticker_Set, THE StickerManager SHALL eliminar ese set de `appConfig.telegramStickerSets` llamando a `setConfig` con el array filtrado, y SHALL remover la card del set del DOM en la misma operación sincrónica.
3. THE StickerManager SHALL renderizar el botón de eliminar con un área de toque mínima de 32×32px y un contraste de texto o ícono de al menos 4.5:1 sobre su fondo inmediato, verificable con herramientas de accesibilidad.
4. WHEN todos los Sticker_Sets son eliminados y `telegramStickerSets` queda como array vacío, THE StickerManager SHALL mostrar únicamente el mensaje "No tienes ningún sticker set guardado todavía." en el área donde aparecían las cards.
5. THE StickerManager SHALL mantener el botón de eliminar siempre visible en el DOM (no condicionado a pseudoclase `:hover` ni a estado de interacción), de modo que sea accesible sin pasar el cursor sobre él.
6. WHEN el usuario hace clic en el botón de eliminar, THE StickerManager SHALL requerir una confirmación explícita antes de ejecutar la eliminación, para prevenir borrados accidentales.

---

### Requirement 5: Visualización progresiva de stickers con botón "Ver más"

**User Story:** Como usuaria, quiero ver los primeros 5 stickers de un set y poder revelar más de forma progresiva, para no sentirme abrumada por sets grandes.

#### Acceptance Criteria

1. WHEN un Sticker_Set activo tiene 5 o menos stickers, THE StickerPanel SHALL mostrar todos los stickers sin renderizar el botón "Ver más".
2. WHEN un Sticker_Set activo tiene más de 5 stickers, THE StickerPanel SHALL mostrar inicialmente solo los primeros 5 stickers en el orden devuelto por la API de Telegram, y SHALL renderizar el botón "Ver más" debajo de la grilla.
3. WHEN el usuario hace clic en "Ver más" y quedan más de 10 stickers ocultos, THE StickerPanel SHALL incrementar el número de stickers visibles en 10, mostrando los siguientes 10 en el orden de la API.
4. WHEN el usuario hace clic en "Ver más" y quedan 10 o menos stickers ocultos, THE StickerPanel SHALL mostrar todos los stickers restantes y SHALL ocultar el botón "Ver más".
5. WHEN el usuario cambia de tab a otro Sticker_Set, THE StickerPanel SHALL reiniciar el contador de stickers visibles a 5, independientemente de cuántos estuvieran visibles en el set anterior.
6. WHEN el Sticker_Set activo tiene más de 5 stickers y no todos están visibles, THE StickerPanel SHALL mostrar un texto que contenga el número de stickers actualmente visibles y el total del set (ej. "5 de 9") junto al botón "Ver más".
7. IF todos los stickers del set activo ya son visibles, THEN THE StickerPanel SHALL ocultar tanto el botón "Ver más" como el texto de conteo.

---

### Requirement 6: Tamaño diferenciado de stickers respecto a emojis

**User Story:** Como usuaria, quiero que los stickers se muestren notablemente más grandes que los emojis en el panel de reacciones y en las tarjetas, para que sean fácilmente distinguibles y usables.

#### Acceptance Criteria

1. THE EmojiReactions SHALL renderizar las imágenes de stickers en la sección de resumen de reacciones con `width` y `height` mínimos de 36px cada uno, establecidos mediante la clase CSS `.sticker-reaction`.
2. THE StickerPanel SHALL renderizar cada `.sticker-item` en la grilla con `width` y `height` mínimos de 72px cada uno, mediante reglas CSS explícitas en `.sticker-item`.
3. WHEN un sticker se muestra como reaction chip en `.reactions-summary`, THE EmojiReactions SHALL aplicar la clase CSS `.sticker-reaction` al elemento `<img>` con `min-width: 36px` y `min-height: 36px` definidos en la hoja de estilos global.
4. THE StickerPanel SHALL aplicar `object-fit: contain` a todos los elementos `<img>` dentro de `.sticker-item` para preservar la proporción original del sticker al escalar.
5. THE StickerPanel SHALL establecer `.sticker-item` con dimensiones mínimas de 72×72px; dado que `.emoji-btn` se define como 28×28px en la hoja de estilos, esto garantiza que los stickers sean al menos 2.5× el tamaño de los botones de emoji.

---

### Requirement 7: Soporte para stickers animados (.webm y .tgs)

**User Story:** Como usuaria, quiero que los stickers animados de Telegram (.webm o .tgs) se reproduzcan con animación en el panel, para disfrutar de la experiencia completa de stickers de Telegram.

#### Acceptance Criteria

1. WHEN un sticker tiene `is_video: true` y su URL `.webm` es obtenida mediante `getTelegramFileUrl(token, sticker.file_id)`, THE StickerPanel SHALL renderizar dicho sticker usando un elemento `<video>` con los atributos `autoPlay`, `loop`, `muted` y `playsInline`, con dimensiones máximas de 512×512px, en lugar de `<img>`.
2. WHEN un sticker tiene `is_animated: true` (formato TGS), THE StickerPanel SHALL verificar si el custom element `lottie-player` está registrado en el navegador (`customElements.get('lottie-player') !== undefined`) y, si lo está, SHALL renderizarlo con `<lottie-player>`; IF el custom element no está registrado, THEN THE StickerPanel SHALL mostrar el emoji de fallback del sticker.
3. WHEN la URL `.webm` de un sticker `is_video: true` falla (evento `error` del `<video>` antes del primer frame), THE StickerPanel SHALL mostrar la imagen thumbnail estática del sticker como fallback usando un elemento `<img>`.
4. WHEN un sticker tiene `is_video: true` o `is_animated: true`, THE StickerPanel SHALL renderizar un indicador con el atributo `data-animated="true"` superpuesto sobre el thumbnail del sticker, de modo que sea identificable programáticamente y visualmente.
5. WHEN un sticker con `is_video: true` se usa como reacción en EmojiReactions y su URL `.webm` es obtenida mediante `getTelegramFileUrl(token, sticker.file_id)`, THE EmojiReactions SHALL renderizar un elemento `<video>` con `autoPlay`, `loop` y `muted` en el reaction chip, aplicando las mismas dimensiones que la clase CSS `.sticker-reaction`.
6. IF la URL del archivo animado no puede resolverse o su carga falla, THEN THE StickerPanel SHALL renderizar el emoji de fallback del sticker sin mostrar ningún elemento de tipo `role="alert"`, mensaje de error visible ni texto de error en el UI.

---

### Requirement 8: Botón de eliminar sticker al hacer hover en el tablero/tarea

**User Story:** Como usuaria, quiero poder eliminar un sticker que ya añadí como reacción a una comisión pasando el cursor sobre él, para corregir reacciones equivocadas sin tener que buscar una opción oculta.

#### Acceptance Criteria

1. WHEN el usuario posiciona el cursor sobre un reaction chip de sticker en `EmojiReactions`, THE EmojiReactions SHALL hacer visible un botón con el ícono `×` posicionado en la esquina superior derecha del chip, superpuesto sobre la imagen del sticker.
2. WHEN el usuario hace clic en el botón `×` de un reaction chip de sticker, THE EmojiReactions SHALL construir un nuevo mapa de reacciones que sea una copia del mapa actual con la `Reaction_Key` correspondiente eliminada, y SHALL llamar a `onChange` con ese nuevo mapa.
3. IF el cursor no está posicionado sobre un reaction chip de sticker, THEN THE EmojiReactions SHALL mantener el botón `×` con `opacity: 0` o `visibility: hidden`, de modo que no ocupe espacio visual ni sea interactuable en el estado de reposo.
4. WHEN el usuario mantiene pulsado un reaction chip de sticker en un dispositivo táctil durante al menos 500ms, THE EmojiReactions SHALL mostrar el botón `×` de forma persistente hasta que el usuario lo pulse o toque fuera del chip para descartarlo.
5. WHEN el usuario elimina la última reacción activa del mapa (tanto stickers como emojis regulares con count > 0), THE EmojiReactions SHALL ocultar el contenedor `.reactions-summary` del DOM.
6. THE EmojiReactions SHALL posicionar el botón `×` de cada chip de sticker de modo que su área de toque sea de al menos 20×20px y esté completamente contenida dentro de los límites visuales del chip.
