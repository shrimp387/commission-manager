# Requirements Document

## Introduction

Esta especificación cubre cuatro mejoras de personalización y expresividad para la aplicación de gestión de comisiones artísticas (React + Vite):

1. **Fondos individuales por página** — cada sección del sidebar (Studio, Requests, Portfolio, Guide, Settings) puede tener su propia imagen de fondo con editor completo (recorte, resize, zoom, desplazamiento).
2. **Sidebar redimensionable** — el usuario puede arrastrar el borde derecho del sidebar para cambiar su ancho de forma persistente.
3. **Panel de emojis ampliado** — el componente `EmojiReactions` se expande de 8 emojis fijos a una biblioteca completa organizada por categorías con buscador.
4. **Panel de stickers de Telegram** — ventana flotante estilo Telegram para explorar y adjuntar stickers a tareas y comentarios mediante la Bot API de Telegram.

## Glossary

- **App_Shell**: Componente raíz `App.jsx` que contiene el `Sidebar` y el área `app-main`.
- **Sidebar**: Componente `Sidebar.jsx` con ancho controlado por la variable CSS `--sidebar-w` (actualmente fija en 230px).
- **Page_Background_Editor**: Nuevo componente modal que permite al usuario recortar, redimensionar, aplicar zoom y desplazar una imagen antes de guardarla como fondo de una página.
- **Config_Store**: Módulo `src/store/appConfig.js` que persiste la configuración en `localStorage` y expone `getConfig`, `setConfig`, `setConfigMulti`, `subscribeConfig` y `applyConfig`.
- **sectionBgs**: Clave del `Config_Store` de tipo objeto `{ [pageId: string]: { url: string, transform: CropTransform } }` que almacena los fondos por página.
- **CropTransform**: Objeto `{ x: number, y: number, scale: number, width: number, height: number }` que describe el recorte y posición de la imagen de fondo.
- **Sidebar_Resize_Handle**: Elemento interactivo ubicado en el borde derecho del `Sidebar` que permite modificar `--sidebar-w` mediante arrastre.
- **Emoji_Picker**: Nuevo panel expandible dentro de `EmojiReactions.jsx` que muestra emojis agrupados por categoría y con campo de búsqueda.
- **Emoji_Category**: Grupo temático de emojis (por ejemplo: Caritas, Gestos, Animales, Comida, Objetos, Actividades, Símbolos).
- **Sticker_Panel**: Componente flotante que muestra colecciones de stickers obtenidas de la Telegram Bot API.
- **Telegram_Bot_API**: API REST de Telegram (`https://api.telegram.org/bot{token}/`) usada para obtener sticker sets y enviar stickers.
- **Sticker_Set**: Colección de stickers identificada por un nombre único en Telegram.
- **Sidebar_Width**: Valor numérico en píxeles del ancho del sidebar, persistido en el `Config_Store` bajo la clave `sidebarWidth`.

---

## Requirements

### Requirement 1: Fondos individuales por página

**User Story:** Como artista, quiero que cada sección de mi aplicación tenga su propia imagen de fondo personalizada, para que mi espacio de trabajo refleje la identidad visual de cada área de mi estudio.

#### Acceptance Criteria

1. THE `Config_Store` SHALL almacenar fondos por página en la clave `sectionBgs` con estructura `{ [pageId]: { url: string, transform: CropTransform } }`.
2. WHEN el usuario navega a una página, THE `App_Shell` SHALL aplicar el fondo definido en `sectionBgs[pageId]` como imagen de fondo del área de contenido principal (`app-main`), independientemente del valor de `globalBgUrl`.
3. WHEN `sectionBgs[pageId]` está definido, THE `App_Shell` SHALL usar el fondo de página con prioridad sobre el fondo global.
4. WHEN `sectionBgs[pageId]` no está definido, THE `App_Shell` SHALL mostrar el fondo global (`globalBgUrl`) si existe, o ningún fondo en caso contrario.
5. THE `SettingsPage` SHALL incluir un tab llamado "Fondos de página" que liste las cinco páginas (Studio, Requests, Portfolio, Guide, Settings) con su vista previa de fondo actual.
6. WHEN el usuario hace clic en "Cambiar fondo" de una página específica dentro del tab "Fondos de página", THE `Page_Background_Editor` SHALL abrirse como modal.
7. THE `Page_Background_Editor` SHALL aceptar como entrada una imagen cargada desde el sistema de archivos local (formatos JPEG, PNG, WebP, GIF estático).
8. WHEN el usuario carga una imagen en el `Page_Background_Editor`, THE `Page_Background_Editor` SHALL mostrar la imagen en un canvas interactivo que permita recorte (crop) con handles de arrastre.
9. WHILE el `Page_Background_Editor` está abierto, THE `Page_Background_Editor` SHALL permitir al usuario aplicar zoom con valores entre 0.1× y 5× mediante deslizador o rueda del ratón.
10. WHILE el `Page_Background_Editor` está abierto, THE `Page_Background_Editor` SHALL permitir al usuario desplazar (pan) la imagen dentro del área de recorte mediante arrastre con el ratón o el dedo.
11. WHILE el `Page_Background_Editor` está abierto, THE `Page_Background_Editor` SHALL mostrar la resolución de salida resultante del recorte en píxeles, actualizada en tiempo real.
12. WHEN el usuario confirma los cambios en el `Page_Background_Editor`, THE `Config_Store` SHALL guardar la imagen recortada como data URL y la `CropTransform` correspondiente en `sectionBgs[pageId]`.
13. WHEN el usuario confirma los cambios, THE `Page_Background_Editor` SHALL cerrar el modal y el fondo nuevo SHALL ser visible en la página sin recargar la aplicación.
14. WHEN el usuario hace clic en "Quitar fondo" de una página en el tab "Fondos de página", THE `Config_Store` SHALL eliminar la entrada `sectionBgs[pageId]` y la página SHALL mostrar el fondo global o ninguno según el criterio 4.
15. THE `SettingsPage` SHALL mostrar una vista previa en miniatura (thumbnail) de máximo 200×120 píxeles del fondo de cada página dentro del tab "Fondos de página".
16. IF el archivo de imagen seleccionado supera 10 MB, THEN THE `Page_Background_Editor` SHALL mostrar el mensaje "La imagen supera el límite de 10 MB. Elige un archivo más pequeño." y SHALL rechazar la carga.

---

### Requirement 2: Sidebar redimensionable

**User Story:** Como usuario, quiero ajustar el ancho del sidebar arrastrando su borde, para adaptar el espacio de navegación a mis necesidades y tamaño de pantalla.

#### Acceptance Criteria

1. THE `Config_Store` SHALL almacenar el ancho del sidebar bajo la clave `sidebarWidth` con valor por defecto de 230 (número entero en píxeles).
2. WHEN la aplicación se inicializa, THE `App_Shell` SHALL leer `sidebarWidth` del `Config_Store` y aplicar ese valor a la variable CSS `--sidebar-w`.
3. THE `Sidebar` SHALL incluir un `Sidebar_Resize_Handle` como elemento hijo posicionado en su borde derecho, con un área de interacción de al menos 8px de ancho.
4. WHEN el usuario presiona el botón primario del ratón sobre el `Sidebar_Resize_Handle` y arrastra horizontalmente, THE `Sidebar` SHALL actualizar `--sidebar-w` en tiempo real durante el arrastre.
5. WHILE el usuario arrastra el `Sidebar_Resize_Handle`, THE `App_Shell` SHALL prevenir la selección de texto en toda la página.
6. WHEN el usuario suelta el botón del ratón tras un arrastre, THE `Config_Store` SHALL persistir el nuevo valor de `sidebarWidth` con un mínimo de 160px y un máximo de 480px.
7. IF el arrastre resulta en un ancho menor a 160px, THEN THE `Sidebar` SHALL establecer `sidebarWidth` en 160px.
8. IF el arrastre resulta en un ancho mayor a 480px, THEN THE `Sidebar` SHALL establecer `sidebarWidth` en 480px.
9. WHEN el usuario hace doble clic sobre el `Sidebar_Resize_Handle`, THE `Config_Store` SHALL restaurar `sidebarWidth` al valor por defecto de 230px.
10. WHILE el `Sidebar_Resize_Handle` está en foco o el cursor está sobre él, THE `Sidebar_Resize_Handle` SHALL mostrar el cursor de tipo `col-resize`.
11. WHERE la pantalla tiene un ancho menor o igual a 768px (mobile), THE `Sidebar_Resize_Handle` SHALL estar oculto y la funcionalidad de arrastre SHALL estar deshabilitada.

---

### Requirement 3: Panel de emojis ampliado con categorías y búsqueda

**User Story:** Como artista, quiero disponer de una amplia variedad de emojis organizados por categorías y con buscador, para expresar reacciones con mayor precisión y rapidez en mis tareas y comentarios.

#### Acceptance Criteria

1. THE `Emoji_Picker` SHALL contener al menos 500 emojis distribuidos en las siguientes `Emoji_Category` predefinidas: Caritas y emociones, Gestos y personas, Animales y naturaleza, Comida y bebida, Actividades y deportes, Objetos y tecnología, Símbolos y señales.
2. THE `EmojiReactions` SHALL continuar mostrando los 8 emojis de acceso rápido actuales en la fila superior de reacciones activas.
3. THE `EmojiReactions` SHALL incluir un botón "＋" que al ser activado muestre el `Emoji_Picker`.
4. WHEN el usuario activa el botón "＋", THE `Emoji_Picker` SHALL aparecer como panel emergente (popover) anclado al botón mostrando siempre la barra de categorías en la pestaña activa, con una altura máxima de 320px y scroll vertical interno.
5. THE `Emoji_Picker` SHALL mostrar una barra de pestañas horizontal con el ícono representativo de cada `Emoji_Category`.
6. WHEN el usuario selecciona una `Emoji_Category`, THE `Emoji_Picker` SHALL mostrar únicamente los emojis de esa categoría en una cuadrícula de al menos 8 columnas.
7. THE `Emoji_Picker` SHALL incluir un campo de búsqueda de texto en la parte superior que filtre emojis por nombre o descripción en español.
8. WHEN el usuario escribe en el campo de búsqueda, THE `Emoji_Picker` SHALL actualizar la cuadrícula mostrando solo los emojis cuyos nombres contengan el texto ingresado, en un máximo de 300 ms desde el último carácter escrito.
9. WHEN el campo de búsqueda tiene texto, THE `Emoji_Picker` SHALL ocultar la barra de categorías y mostrar los resultados de búsqueda.
10. WHEN la búsqueda no produce resultados, THE `Emoji_Picker` SHALL mostrar el mensaje "Sin resultados para «{texto}»".
11. WHEN el usuario hace clic en un emoji dentro del `Emoji_Picker`, THE `EmojiReactions` SHALL intentar registrar la reacción, agregar el emoji a la fila de reacciones activas si no estaba presente, y cerrar el `Emoji_Picker`, manejando cada acción de forma independiente para que un fallo parcial no bloquee las demás.
12. WHEN el `Emoji_Picker` está abierto y el usuario hace clic fuera de él, THE `Emoji_Picker` SHALL cerrarse sin cambiar ninguna reacción.
13. THE `Emoji_Picker` SHALL ser accesible mediante teclado: navegación entre emojis con teclas de flecha, confirmación con Enter, y cierre con Escape.
14. THE `Emoji_Picker` SHALL persistir la última `Emoji_Category` activa durante la sesión actual del navegador (sin persistencia en `localStorage`).

---

### Requirement 4: Panel de stickers de Telegram

**User Story:** Como artista, quiero poder explorar y añadir stickers de Telegram a mis tareas y comentarios, para enriquecer la comunicación visual con mis clientes y colaboradores desde la misma aplicación.

#### Acceptance Criteria

1. THE `Config_Store` SHALL almacenar la lista de nombres de `Sticker_Set` favoritos del usuario bajo la clave `telegramStickerSets` con valor por defecto de arreglo vacío.
2. THE `Sticker_Panel` SHALL ser accesible desde el componente `EmojiReactions` mediante un botón con ícono de sticker, adicional al botón "＋" de emojis.
3. WHEN el usuario activa el botón de stickers, THE `Sticker_Panel` SHALL aparecer como panel emergente (popover) con ancho de 320px y altura máxima de 400px.
4. THE `Sticker_Panel` SHALL incluir un campo de texto para ingresar el nombre de un `Sticker_Set` de Telegram y un botón "Agregar".
5. WHEN el usuario ingresa el nombre de un `Sticker_Set` y presiona "Agregar", THE `Sticker_Panel` SHALL consultar el endpoint `GET https://api.telegram.org/bot{token}/getStickerSet?name={nombre}` usando el token almacenado en la configuración de Telegram existente (`telegram_config` en `localStorage`).
6. WHEN la consulta a la `Telegram_Bot_API` devuelve un `Sticker_Set` válido, THE `Sticker_Panel` SHALL guardar el nombre del set en `telegramStickerSets` y mostrar los stickers del set en una cuadrícula de 4 columnas.
7. IF la consulta a la `Telegram_Bot_API` falla o el set no existe, THEN THE `Sticker_Panel` SHALL mostrar el mensaje "No se encontró el set «{nombre}». Verifica el nombre e inténtalo de nuevo."
8. IF el token de Telegram no está configurado, THEN THE `Sticker_Panel` SHALL mostrar el mensaje "Configura tu Bot Token de Telegram en Configuración → Solicitudes antes de usar stickers."
9. THE `Sticker_Panel` SHALL mostrar una pestaña por cada `Sticker_Set` guardado en `telegramStickerSets`, con el título del set como etiqueta.
10. WHEN el usuario selecciona un `Sticker_Set` en el `Sticker_Panel`, THE `Sticker_Panel` SHALL mostrar los stickers del set en una cuadrícula de 4 columnas con miniaturas de 64×64 píxeles.
11. WHEN el usuario hace clic en un sticker dentro del `Sticker_Panel`, THE `Sticker_Panel` SHALL insertar el `file_id` del sticker y su URL de miniatura en el objeto de reacciones/comentario activo y SHALL cerrar el panel.
12. WHEN el `Sticker_Panel` realiza una llamada activa a la `Telegram_Bot_API` para obtener un `Sticker_Set`, THE `Sticker_Panel` SHALL mostrar un indicador de carga (spinner) durante la duración de esa llamada.
13. WHEN el usuario hace clic en el ícono de eliminar junto a una pestaña de `Sticker_Set`, THE `Config_Store` SHALL remover ese nombre de `telegramStickerSets` y el set SHALL dejar de aparecer en el `Sticker_Panel`.
14. THE `Sticker_Panel` SHALL ser accesible mediante teclado: navegación entre stickers con teclas de flecha, confirmación con Enter, y cierre con Escape.
15. IF el servidor proxy (`server.js`) está disponible en `localhost:3001`, THE `Sticker_Panel` SHALL enrutar las llamadas a la `Telegram_Bot_API` a través del proxy para evitar restricciones CORS, usando el path `/proxy/telegram/{endpoint}`.
16. WHEN el `Sticker_Panel` está abierto y el usuario hace clic fuera de él, THE `Sticker_Panel` SHALL cerrarse sin modificar ninguna reacción ni comentario.
