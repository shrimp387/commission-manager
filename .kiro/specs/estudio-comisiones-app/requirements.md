# Requirements Document

## Introduction

Este documento define los requisitos para la aplicación web **Estudio de Comisiones**, una herramienta integral de gestión para artistas de comisiones digitales. La aplicación consta de cuatro secciones principales: (1) un panel de administración sincronizado con la API REST de Taskade para gestionar comisiones activas; (2) un formulario público multi-paso para que clientes envíen solicitudes, con notificación automática a Telegram; (3) una galería de portafolio de tipo masonry con subida de imágenes; y (4) una guía del estudio con editor de bloques estilo Notion. La aplicación ya cuenta con una base React + Vite en `localhost:5174` y un proxy Node.js en `localhost:3001` que conecta con la API de Taskade.

---

## Glossary

- **App**: La aplicación web React + Vite descrita en este documento.
- **Admin**: El artista/propietario del estudio que utiliza las vistas de administración.
- **Cliente**: Persona externa que envía una solicitud de comisión a través del formulario público.
- **Commission**: Una tarea de ilustración/diseño encargada por un Cliente.
- **CommissionForm**: El formulario público multi-paso de 5 pasos que completa el Cliente para enviar una solicitud.
- **CommissionRequest**: Los datos estructurados de una solicitud enviada a través del CommissionForm, almacenados localmente.
- **TaskadeAPI**: La API REST de Taskade v1 accesible a través del proxy en `localhost:3001/proxy`.
- **Proxy**: El servidor Node.js local en `localhost:3001` que reenvía solicitudes a la API de Taskade evitando CORS.
- **Task**: Una tarea individual dentro de un proyecto de Taskade, representando una Commission.
- **Section**: Una tarea raíz de Taskade que agrupa Tasks (Backlog, Comisiones Nuevas, En Proceso, En Revisión).
- **FieldPill**: Elemento de UI interactivo con color que representa un campo de tarea (Prioridad, Etapa, Cliente, etc.).
- **Stage**: Etapa del proceso artístico de una Commission (Nueva, Sketch, Lineart, Color base, Sombreado, En revisión, Entregado).
- **Priority**: Nivel de urgencia de una Commission (Urgente, En espera, Todo en orden).
- **ListView**: Modo de visualización de comisiones como lista jerárquica colapsable.
- **BoardView**: Modo de visualización de comisiones como tablero Kanban con columnas arrastrables.
- **Sidebar**: Panel de navegación lateral fijo con acceso a todas las secciones de la App.
- **Portfolio**: Colección de obras del artista mostrada en galería masonry.
- **StudioGuide**: Documento editable por bloques que describe las políticas y procesos del estudio.
- **TelegramBot**: Bot de Telegram configurado por el Admin para recibir notificaciones de nuevas solicitudes.
- **TelegramConfig**: Configuración del TelegramBot (Bot Token y Chat ID) guardada en localStorage.
- **Lightbox**: Visor modal de imagen ampliada con navegación entre imágenes.
- **ContextMenu**: Menú emergente de opciones que aparece al hacer clic derecho o en el botón "..." de una Task.
- **DatePicker**: Selector visual de fecha en formato calendario con navegación por mes/año.
- **ProgressBar**: Barra visual que indica el porcentaje de avance de una Commission.
- **LocalStorage**: Mecanismo de almacenamiento del navegador usado para persistir solicitudes, portafolio y configuración.

---

## Requirements

---

### Requirement 1: Navegación y estructura general (Sidebar)

**User Story:** Como Admin, quiero una barra de navegación lateral fija, para acceder rápidamente a cualquier sección de la App sin perder el contexto de trabajo.

#### Acceptance Criteria

1. THE App SHALL renderizar un Sidebar fijo a la izquierda de la pantalla que permanece visible en todas las secciones.
2. THE Sidebar SHALL mostrar los siguientes ítems de navegación en orden: Estudio de Comisiones, Solicitudes de Comisión, Galería de Portafolio, Guía del Estudio.
3. WHEN el Admin hace clic en un ítem de navegación del Sidebar, THE App SHALL mostrar la sección correspondiente y marcar visualmente ese ítem como activo con un color de acento (verde).
4. WHILE la App está en pantalla de ancho menor a 768px, THE Sidebar SHALL ocultarse por defecto y mostrarse como un menú desplegable al pulsar un botón hamburguesa.
5. THE Sidebar SHALL mostrar secciones adicionales como placeholders no navegables: Agentes de IA, Automatizaciones, Medios de comunicación, Integraciones, Mapa DNA.
6. WHEN el Admin hace clic en un ítem placeholder del Sidebar, THE App SHALL mostrar un mensaje indicando que esa función no está disponible aún.

---

### Requirement 2: Estudio de Comisiones — Vista Lista

**User Story:** Como Admin, quiero ver y gestionar todas mis comisiones en una lista jerárquica sincronizada con Taskade, para tener control total del estado de cada trabajo.

#### Acceptance Criteria

1. WHEN la sección "Estudio de Comisiones" se carga, THE App SHALL obtener todas las Tasks del proyecto Taskade con ID `5frmN91mysJEwV1W` a través del Proxy y renderizarlas agrupadas por Section.
2. THE ListView SHALL mostrar cada Section como un grupo colapsable con un icono ▸ (colapsado) o ▾ (expandido) al inicio del nombre de la sección.
3. WHEN el Admin hace clic en el icono de colapso de una Section, THE ListView SHALL alternar entre mostrar u ocultar las Tasks de esa Section.
4. THE ListView SHALL mostrar para cada Task los siguientes campos como FieldPills: Prioridad (colores: Urgente=#EF4444, En espera=#F59E0B, Todo en orden=#22C55E), Etapa (colores definidos por Stage), y Cliente (texto editable).
5. WHEN el Admin hace clic en un FieldPill de Prioridad, THE App SHALL mostrar un dropdown con las opciones: Urgente, En espera, Todo en orden; y al seleccionar una opción, THE App SHALL actualizar el campo de la Task en la TaskadeAPI usando PUT `/tasks/{taskId}`.
6. WHEN el Admin hace clic en un FieldPill de Etapa, THE App SHALL mostrar un dropdown con las opciones de Stage; y al seleccionar una opción, THE App SHALL actualizar el campo de la Task en la TaskadeAPI.
7. WHEN el Admin hace clic en un FieldPill de Cliente, THE App SHALL mostrar un input de texto editable inline con el valor actual; y al confirmar (Enter o clic fuera), THE App SHALL actualizar el campo Cliente de la Task en la TaskadeAPI.
8. THE ListView SHALL mostrar un campo "Siguiente paso" por Task con su valor actual; WHEN el Admin hace clic en ese campo, THE App SHALL abrir un popup "Editar Siguiente paso" con un input de texto pre-poblado y botones: Cancelar, Guardar cambios, Eliminar.
9. WHEN el Admin hace clic en "Guardar cambios" en el popup de Siguiente paso, THE App SHALL actualizar el campo en la TaskadeAPI y cerrar el popup.
10. WHEN el Admin hace clic en "Eliminar" en el popup de Siguiente paso, THE App SHALL vaciar el campo Siguiente paso en la TaskadeAPI y cerrar el popup.
11. THE ListView SHALL mostrar un campo "Avance" por Task como número entero entre 0 y 100 seguido del símbolo %; WHEN el Admin hace clic en el valor de Avance, THE App SHALL mostrar un input numérico editable; y al confirmar, THE App SHALL actualizar el campo Progreso de la Task en la TaskadeAPI.
12. THE ListView SHALL mostrar un DatePicker para el campo Fecha límite de cada Task; WHEN el Admin selecciona una fecha, THE App SHALL actualizar el campo Deadline de la Task en la TaskadeAPI.
13. THE DatePicker SHALL mostrar el mes y año actuales, permitir navegar entre meses con flechas ‹ ›, resaltar el día de hoy con color verde, y marcar la fecha seleccionada.
14. THE ListView SHALL mostrar un botón "+" por Task que al hacer clic abre un ContextMenu con las secciones: acciones (Agente de IA, Fecha límite, Asignar, Comentario, Subir archivo, Embed, Temporizador, Reacción) y PREAJUSTES (Prioridad, Etapa).
15. WHEN el Admin selecciona "Subir archivo" en el ContextMenu, THE App SHALL abrir un selector de origen de archivo con opciones: Computadora, Google Drive, Dropbox, Instagram, OneDrive, Cámara, Audio, Screencast.
16. WHEN el Admin sube un archivo desde Computadora, THE App SHALL mostrar un thumbnail de la imagen debajo de la Task y un contador "⬆ N" con el número de archivos adjuntos.
17. WHEN el Admin hace clic derecho sobre una Task o en su botón "...", THE ContextMenu SHALL mostrar: Agregar tarea arriba, Agregar tarea abajo, Añadir nota, Destacar, Marcar, Duplicar, Copiar link, Copiar a, Mover a, Ordenar por, Calendario, Enviar a automatización, Mención, Etiqueta, Eliminar.
18. WHEN el Admin selecciona "Eliminar" del ContextMenu de una Task, THE App SHALL solicitar confirmación y, si el Admin confirma, eliminar la Task en la TaskadeAPI usando DELETE `/tasks/{taskId}`.
19. WHEN el Admin selecciona "Agregar tarea abajo" del ContextMenu, THE App SHALL crear una nueva Task en la TaskadeAPI en la misma Section que la Task seleccionada y mostrarla inmediatamente en la ListView.
20. THE ListView SHALL mostrar un chip "+N más" cuando una Task tenga más de 3 campos visibles; WHEN el Admin hace clic en ese chip, THE App SHALL expandir y mostrar todos los campos ocultos de esa Task.
21. IF la TaskadeAPI devuelve un error al cargar las Tasks, THEN THE App SHALL mostrar un mensaje de error descriptivo y un botón "Reintentar".

---

### Requirement 3: Estudio de Comisiones — Vista Tablero (Kanban)

**User Story:** Como Admin, quiero alternar entre la vista lista y un tablero Kanban, para visualizar el flujo de trabajo de mis comisiones de forma más visual.

#### Acceptance Criteria

1. THE App SHALL mostrar un control de alternancia (switch/toggle) en la cabecera de la sección "Estudio de Comisiones" para cambiar entre ListView y BoardView.
2. WHEN el Admin activa la BoardView, THE App SHALL mostrar las mismas Tasks organizadas en columnas Kanban correspondientes a las Sections: Backlog, Comisiones Nuevas, En Proceso, En Revisión.
3. THE BoardView SHALL mostrar cada Task como una tarjeta que contiene: título, FieldPills de Prioridad y Etapa, nombre del Cliente, ProgressBar, y thumbnail de imagen si la Task tiene archivos adjuntos.
4. THE BoardView SHALL permitir arrastrar y soltar tarjetas entre columnas; WHEN el Admin suelta una tarjeta en una nueva columna, THE App SHALL actualizar la Task en la TaskadeAPI para reflejar el cambio de Section y verificar que el campo de sección de la Task coincide con la columna destino antes de confirmar el movimiento visualmente.
5. WHEN el Admin arrastra una tarjeta, THE App SHALL mostrar una animación visual de la tarjeta en movimiento y resaltar la columna de destino.
6. IF la TaskadeAPI devuelve un error al mover una tarea entre columnas, THEN THE App SHALL revertir visualmente la tarjeta a su columna original y mostrar un mensaje de error.
7. THE BoardView SHALL mantener el mismo conjunto de datos que la ListView; WHEN el Admin actualiza un campo en la ListView, THE App SHALL reflejar el cambio al volver a la BoardView sin recargar la página.

---

### Requirement 4: Solicitudes de Comisión — Formulario público multi-paso

**User Story:** Como Cliente, quiero completar un formulario de solicitud de comisión en varios pasos claros, para proporcionar toda la información necesaria al artista de forma organizada.

#### Acceptance Criteria

1. THE CommissionForm SHALL presentar el proceso de solicitud en exactamente 5 pasos secuenciales, con una barra de progreso visible que indica el paso actual (ej.: "Paso 2 de 5").
2. THE CommissionForm SHALL mostrar en el Paso 1 los campos: Nombre (requerido, texto), Correo electrónico (requerido, formato email válido), Redes sociales (opcional, texto).
3. IF el Cliente intenta avanzar del Paso 1 sin Nombre o con Correo electrónico de formato inválido, THEN THE CommissionForm SHALL mostrar mensajes de error por campo y bloquear la navegación al Paso 2.
4. THE CommissionForm SHALL mostrar en el Paso 2 los campos: Tipo de obra (requerido, selección de opciones: retrato, ilustración, logo, cómic, diseño de personaje, otro), Descripción detallada (requerido, textarea de mínimo 3 líneas), Estilo preferido (opcional, chips seleccionables: realista, anime, cartoon, semi-realista, minimalista, otro), Uso final (requerido, opciones: Personal, Comercial).
4. IF el Cliente intenta avanzar del Paso 2 sin Tipo de obra, Descripción detallada o Uso final, THEN THE CommissionForm SHALL mostrar mensajes de error y bloquear la navegación al Paso 3.
5. THE CommissionForm SHALL mostrar en el Paso 3: una zona de subida de imágenes de referencia que acepte hasta 5 archivos de tipo imagen (PNG, JPG, WEBP, GIF) mediante drag-and-drop o clic, un campo para pegar URLs de imágenes externas, y un campo de notas sobre las referencias (opcional).
6. WHEN el Cliente sube imágenes en el Paso 3, THE CommissionForm SHALL mostrar thumbnails de vista previa de las imágenes cargadas y un botón para eliminar cada imagen individualmente.
7. IF el Cliente intenta subir más de 5 imágenes en el Paso 3, THEN THE CommissionForm SHALL rechazar los archivos adicionales y mostrar un mensaje indicando el límite máximo.
8. THE CommissionForm SHALL mostrar en el Paso 4 los campos: Tamaño/resolución (texto opcional, ej.: "A4 a 300dpi"), Formato de entrega (selección múltiple de: PNG, JPG, PSD, PDF, SVG), Fecha límite deseada mediante DatePicker (opcional), Presupuesto estimado mediante un input de rango con valor mínimo y máximo en USD (opcional), Notas adicionales (textarea opcional).
9. THE CommissionForm SHALL mostrar en el Paso 5 un resumen de todos los datos ingresados en los pasos anteriores incluyendo thumbnails de las imágenes de referencia, un checkbox "Acepto los términos y condiciones de uso" (requerido para enviar), y dos botones: "Pagar y enviar solicitud" (placeholder sin lógica de pago real) y "Enviar sin pago (presupuesto por confirmar)".
10. IF el Cliente intenta enviar la solicitud desde cualquier paso sin haber marcado el checkbox de términos en el Paso 5, THEN THE CommissionForm SHALL mostrar un mensaje de error y no enviar la solicitud.
11. THE CommissionForm SHALL permitir al Cliente navegar al paso anterior en cualquier momento mediante un botón "Anterior" sin perder los datos ya ingresados.
12. WHEN el Cliente envía la solicitud (cualquiera de los dos botones del Paso 5), THE App SHALL guardar la CommissionRequest como objeto JSON en LocalStorage con un identificador único (UUID v4), timestamp de creación, y todos los campos del formulario.
13. WHEN el Cliente envía la solicitud exitosamente, THE App SHALL mostrar una pantalla de confirmación con el mensaje "¡Tu solicitud fue enviada con éxito!" y un resumen del número de solicitud.

---

### Requirement 5: Solicitudes de Comisión — Integración con Telegram

**User Story:** Como Admin, quiero recibir una notificación en Telegram cada vez que un Cliente envía una solicitud, para enterarme de inmediato sin tener que revisar la aplicación manualmente.

#### Acceptance Criteria

1. THE App SHALL proporcionar una pantalla de configuración de TelegramConfig con dos campos: "Bot Token" (texto, requerido) y "Chat ID" (texto, requerido), y un botón "Guardar configuración".
2. WHEN el Admin guarda la TelegramConfig, THE App SHALL persistir el Bot Token y el Chat ID en LocalStorage bajo la clave `telegram_config`.
3. WHEN el Cliente envía una CommissionRequest y la TelegramConfig tiene Bot Token y Chat ID configurados, THE App SHALL enviar un mensaje a la API de Telegram (`https://api.telegram.org/bot{TOKEN}/sendMessage`) con el siguiente formato estructurado: nombre del Cliente, correo electrónico, tipo de obra, descripción (truncada a 300 caracteres), uso final, presupuesto estimado, fecha límite deseada, y número de imágenes de referencia adjuntas.
4. WHEN hay imágenes de referencia en la CommissionRequest y la TelegramConfig está configurada, THE App SHALL enviar cada imagen como foto separada a la API de Telegram usando el endpoint `sendPhoto` con el mismo `chat_id`, hasta un máximo de 5 fotos, de forma independiente al envío del mensaje principal.
5. IF la API de Telegram devuelve un error al enviar la notificación, THEN THE App SHALL continuar el proceso de guardado de la CommissionRequest en LocalStorage y mostrar un aviso no bloqueante al Admin indicando que la notificación de Telegram falló.
6. WHEN la TelegramConfig no está configurada (Bot Token o Chat ID vacíos), THE App SHALL omitir el envío a Telegram y guardar la CommissionRequest normalmente sin mostrar error al Cliente.
7. THE App SHALL proveer un botón "Probar conexión" en la pantalla de TelegramConfig que, al hacer clic, envíe un mensaje de prueba al Chat ID configurado y muestre el resultado (éxito o error) al Admin.

---

### Requirement 6: Solicitudes de Comisión — Vista Admin de solicitudes

**User Story:** Como Admin, quiero ver, revisar y gestionar todas las solicitudes recibidas en un panel dedicado, para decidir cuáles aceptar y convertir en comisiones activas.

#### Acceptance Criteria

1. THE App SHALL mostrar en la sección "Solicitudes de Comisión" una lista de todas las CommissionRequests almacenadas en LocalStorage, ordenadas por timestamp de creación descendente.
2. THE App SHALL mostrar para cada CommissionRequest en la lista: nombre del Cliente, correo electrónico, tipo de obra, fecha de envío, presupuesto estimado, y un badge de estado (Pendiente/Aceptada/Rechazada) con colores diferenciados (Pendiente=#F59E0B, Aceptada=#22C55E, Rechazada=#EF4444).
3. WHEN el Admin hace clic en una CommissionRequest de la lista, THE App SHALL mostrar un panel de detalle con todos los campos de la solicitud, incluyendo thumbnails de todas las imágenes de referencia subidas.
4. THE App SHALL mostrar en el panel de detalle de la CommissionRequest dos botones: "Aceptar solicitud" (visible únicamente cuando el estado es "Pendiente") y "Rechazar solicitud" (visible cuando el estado es "Pendiente" o "Aceptada").
5. WHEN el Admin hace clic en "Aceptar solicitud", THE App SHALL actualizar el estado de la CommissionRequest a "Aceptada" en LocalStorage y crear automáticamente una nueva Task en la TaskadeAPI en la Section "Comisiones Nuevas" (ID: `02ee79a6-abd7-436f-938b-4386c520e203`) con el nombre del Cliente y tipo de obra como título.
6. IF la TaskadeAPI devuelve un error al crear la Task tras aceptar una solicitud, THEN THE App SHALL mantener el estado de la CommissionRequest como "Pendiente" en LocalStorage y mostrar un mensaje de error al Admin con opción de reintentar.
7. WHEN el Admin hace clic en "Rechazar solicitud", THE App SHALL mostrar un campo de texto opcional para ingresar el motivo del rechazo y, al confirmar, actualizar el estado de la CommissionRequest a "Rechazada" en LocalStorage.
8. THE App SHALL mostrar una métrica de resumen en la parte superior de la sección: total de solicitudes recibidas, cuántas están pendientes, cuántas aceptadas, y cuántas rechazadas.

---

### Requirement 7: Galería de Portafolio

**User Story:** Como Admin, quiero mostrar mis obras en una galería visual atractiva, para presentar mi portafolio a potenciales clientes de forma profesional.

#### Acceptance Criteria

1. WHEN el Admin navega a la sección "Galería de Portafolio", THE App SHALL mostrar una cuadrícula de tipo masonry con las imágenes del portafolio almacenadas, manteniendo las proporciones originales de cada imagen; la cuadrícula masonry no estará visible en otras secciones de la App.
2. THE App SHALL permitir al Admin subir nuevas imágenes al Portfolio mediante una zona de drag-and-drop o un botón de selección de archivo, aceptando formatos PNG, JPG, WEBP y GIF.
3. WHEN el Admin sube una imagen al Portfolio, THE App SHALL guardar los datos de la imagen (en formato base64 o referencia de objeto URL) junto con sus metadatos (título, descripción, tags, timestamp) en LocalStorage.
4. THE App SHALL mostrar sobre cada imagen del Portfolio un overlay con: título editable, icono de edición y botón de eliminar; WHEN el Admin hace clic en el icono de edición, THE App SHALL mostrar un formulario inline para editar título, descripción y tags de esa imagen.
5. WHEN el Admin guarda los cambios de metadatos de una imagen del Portfolio, THE App SHALL persistir los cambios en LocalStorage inmediatamente.
6. WHEN el Admin hace clic en una imagen del Portfolio, THE App SHALL abrir un Lightbox con la imagen a tamaño completo, un botón de cierre, y botones de navegación (← anterior, → siguiente) para recorrer todas las imágenes del portafolio.
7. WHEN el Admin está en el Lightbox y hace clic en "→ siguiente" o "← anterior", THE App SHALL mostrar la imagen adyacente en el portafolio sin cerrar el Lightbox.
8. THE App SHALL mostrar un panel de filtro sobre la galería con los tags disponibles; WHEN el Admin selecciona uno o más tags, THE App SHALL filtrar y mostrar únicamente las imágenes que contengan todos los tags seleccionados; el panel de filtro puede mostrarse u ocultarse de forma independiente a la acción de filtrado.
9. THE App SHALL permitir al Admin reordenar las imágenes del Portfolio arrastrando y soltando; WHEN el Admin suelta una imagen en una nueva posición, THE App SHALL guardar el nuevo orden en LocalStorage.
10. WHEN el Admin hace clic en el botón de eliminar de una imagen del Portfolio, THE App SHALL solicitar confirmación y, si el Admin confirma, eliminar la imagen y sus metadatos de LocalStorage.
11. IF LocalStorage no contiene imágenes del Portfolio, THE App SHALL mostrar un estado vacío con un mensaje instructivo y la zona de drag-and-drop prominente.

---

### Requirement 8: Guía del Estudio — Editor de bloques

**User Story:** Como Admin, quiero editar y mantener actualizada la guía de mi estudio con un editor de bloques simple, para comunicar mis políticas y procesos a los clientes y colaboradores.

#### Acceptance Criteria

1. WHEN la sección "Guía del Estudio" se carga por primera vez, THE App SHALL intentar cargar el contenido del proyecto Taskade con ID `B2tLJ3aQyxXnoka` a través del Proxy y convertirlo en bloques de la StudioGuide.
2. THE StudioGuide SHALL soportar los siguientes tipos de bloque: Encabezado H1, Encabezado H2, Encabezado H3, Párrafo, Lista con viñetas, Lista numerada, Imagen (subir archivo o pegar URL), Link/Embed, Separador horizontal.
3. WHEN el Admin hace clic en cualquier bloque de la StudioGuide, THE App SHALL activar el modo de edición inline de ese bloque, mostrando el cursor de texto.
4. THE StudioGuide SHALL mostrar un botón "+" flotante entre bloques o al final del documento; WHEN el Admin hace clic en "+", THE App SHALL mostrar un menú de selección de tipo de bloque y, al elegir uno, THE App SHALL insertar un bloque vacío de ese tipo en la posición correspondiente.
5. THE StudioGuide SHALL guardar automáticamente todos los cambios en LocalStorage con un debounce de 1 segundo desde la última modificación; WHEN el guardado automático se ejecuta, THE App SHALL mostrar brevemente un indicador "Guardado" en la interfaz.
6. THE StudioGuide SHALL permitir al Admin mover bloques hacia arriba o hacia abajo usando controles de ordenamiento visibles al pasar el cursor sobre cada bloque.
7. THE StudioGuide SHALL permitir al Admin eliminar cualquier bloque usando un botón de eliminación visible al pasar el cursor sobre el bloque; WHEN el Admin hace clic en eliminar un bloque, THE App SHALL eliminar el bloque sin solicitar confirmación adicional.
8. IF el Proxy devuelve un error al cargar el contenido de Taskade para la StudioGuide, THEN THE App SHALL inicializar la StudioGuide con un documento vacío, tratar el error del Proxy como un fallo definitivo que impide la carga de cualquier contenido, y mostrar un aviso no bloqueante al Admin.

---

### Requirement 9: Estética visual y tema

**User Story:** Como Admin, quiero que la aplicación tenga un aspecto visual atractivo e inspirado en Taskade Genesis, para disfrutar de una experiencia de uso coherente y profesional.

#### Acceptance Criteria

1. THE App SHALL implementar un tema oscuro como modo predeterminado, con colores de fondo de superficie entre #0F0F0F y #1E1E2E.
2. THE App SHALL mostrar un encabezado con degradado multicolor (verde, morado, naranja) en cada sección principal de la aplicación.
3. THE App SHALL renderizar todos los FieldPills con bordes completamente redondeados (border-radius: 9999px), texto en color blanco o negro según el contraste del color de fondo, y un color de fondo sólido correspondiente al valor del campo.
4. THE App SHALL mostrar todos los dropdowns y ContextMenus con un estilo consistente: fondo oscuro (#1E1E2E), separadores sutiles, opciones con color de acento al pasar el cursor, y bordes redondeados.
5. THE App SHALL aplicar transiciones CSS suaves (duración 150–300ms) al colapsar/expandir secciones, abrir/cerrar dropdowns, y al arrastrar tarjetas en la BoardView.
6. THE App SHALL ser completamente funcional en resoluciones de escritorio (≥1280px) y mostrar un layout responsivo adaptado para tabletas (768px–1279px) y móviles (≤767px).
7. WHERE el Admin usa la BoardView, THE App SHALL mostrar las tarjetas Kanban con un fondo de tarjeta ligeramente más claro que la columna de fondo, sombra sutil, y esquinas redondeadas.

---

### Requirement 10: Sincronización y persistencia de datos

**User Story:** Como Admin, quiero que los cambios que hago en la aplicación se reflejen en Taskade y se persistan localmente, para no perder información si la sesión se interrumpe.

#### Acceptance Criteria

1. WHEN el Admin actualiza un campo de una Task (Prioridad, Etapa, Cliente, Avance, Fecha límite, Siguiente paso), THE App SHALL enviar la actualización a la TaskadeAPI y mostrar un indicador visual de carga mientras espera la respuesta.
2. WHEN la TaskadeAPI confirma la actualización de un campo, THE App SHALL actualizar el estado local de la Task sin necesidad de recargar todas las Tasks desde la API.
3. IF la TaskadeAPI devuelve un error en cualquier operación de escritura, THEN THE App SHALL mostrar un mensaje de error no bloqueante con el detalle del problema y mantener el valor anterior del campo en la UI; si el sistema de presentación de errores también falla, THE App SHALL mantener el valor anterior del campo sin mostrar mensaje.
4. THE App SHALL implementar un mecanismo de reintento automático con backoff exponencial (máximo 3 intentos) para las solicitudes fallidas a la TaskadeAPI.
5. WHEN el Admin hace clic en el botón "Actualizar" de la sección "Estudio de Comisiones", THE App SHALL volver a cargar todas las Tasks desde la TaskadeAPI y actualizar la UI.
6. THE App SHALL persistir en LocalStorage las imágenes subidas a las Tasks como base64, las CommissionRequests, el contenido de la StudioGuide, el orden del Portfolio, y la TelegramConfig.
