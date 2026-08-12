# Requirements Document

## Introduction

El **Artwork Publish Pipeline** es una funcionalidad completa de publicación automática de obras de arte que se integra al flujo de comisiones existente. Cuando una comisión alcanza el stage `delivered`, el artista puede publicar la obra final en múltiples plataformas artísticas simultáneamente a través de **PostyBirb v4** (corriendo localmente en Docker + Cloudflare Tunnel), con generación automática de tags mediante **OpenAI Vision API** (estilo e621). El historial de publicaciones se registra en una nueva sección "Publicaciones" del sidebar.

---

## Glossary

- **Pipeline**: El flujo completo de preparación y envío de una obra a PostyBirb para su publicación.
- **PostyBirb**: Aplicación de escritorio (v4, NestJS, puerto 8080) que gestiona la publicación en múltiples plataformas artísticas. Corre en la PC del artista vía Docker.
- **Cloudflare_Tunnel**: URL HTTPS pública configurada por el artista que expone el servidor PostyBirb local a internet. Ejemplo: `https://postybirb.midominio.com`.
- **Publish_Panel**: Modal o panel lateral que aparece en la tarjeta Kanban al hacer clic en "Preparar publicación".
- **Tag_Generator**: Servicio interno que llama a la OpenAI Vision API para analizar la imagen y producir tags estilo e621.
- **Publication_Record**: Registro persistente de una publicación enviada a PostyBirb, con estado, metadatos y referencia a la comisión de origen.
- **Publication_History**: La página/sección del sidebar que lista todos los Publication_Records del artista.
- **PostyBirb_Submission**: Objeto interno de PostyBirb creado mediante `POST /submissions` que agrupa archivo, metadatos y plataformas destino.
- **Platform_Account**: Cuenta de red social conectada en PostyBirb, obtenida mediante `GET /api/account`.
- **Delivered_Task**: Tarea del Kanban cuyo campo `stage` es `delivered`.
- **High_Res_Attachment**: El adjunto de tipo imagen (`type` comienza con `image/`) de mayor tamaño (`size`) entre los `attachments` de una tarea.
- **e621_Tags**: Taxonomía de tags usada en la plataforma e621, organizada en categorías: `species`, `character`, `artist`, `general`, `copyright`, `meta`.
- **AppConfig_Store**: El store `src/store/appConfig.js` que persiste configuración del artista mediante `getConfig()` / `setConfig()`.
- **Supabase**: Base de datos y backend de autenticación del proyecto.
- **R2_Worker**: Cloudflare Worker en `r2-worker/` que sirve las imágenes almacenadas en Cloudflare R2.

---

## Requirements

---

### Requirement 1: Botón de publicación en tarjeta Kanban

**User Story:** Como artista, quiero ver un botón "Preparar publicación" en las tarjetas con stage `delivered`, para iniciar el pipeline de publicación sin salir del Kanban.

#### Acceptance Criteria

1. IF una tarjeta Kanban tiene `fields.stage === 'delivered'`, THEN THE KanbanCard SHALL renderizar un botón con etiqueta "📢 Preparar publicación" en la zona de botones de acción de la tarjeta (debajo de las pills de prioridad, cliente y stage).
2. WHEN el stage de una tarjeta cambia a un valor distinto de `delivered`, THE KanbanCard SHALL ocultar el botón "📢 Preparar publicación" de esa tarjeta de forma inmediata, en el mismo ciclo de renderizado.
3. WHEN el artista hace clic en el botón "📢 Preparar publicación" y no hay ningún Publish_Panel abierto, THE KanbanBoard SHALL montar el Publish_Panel como overlay (position: fixed, z-index elevado) pasándole el identificador de la tarea, sin modificar la URL ni la posición de scroll del Kanban.
4. WHEN el artista hace clic en "📢 Preparar publicación" y ya hay un Publish_Panel abierto para otra tarea, THE KanbanBoard SHALL cerrar el panel existente y abrir inmediatamente uno nuevo para la tarea recién seleccionada.
5. IF una tarjeta con `fields.stage === 'delivered'` no tiene ningún adjunto cuyo campo `type` comience con `image/`, THEN THE KanbanCard SHALL renderizar el botón "📢 Preparar publicación" con `disabled={true}` y atributo `title="Adjunta la imagen final antes de publicar"`, y un clic sobre él no deberá abrir el Publish_Panel.

---

### Requirement 2: Generación automática de tags con IA

**User Story:** Como artista, quiero que la IA analice la imagen de la obra y genere tags automáticos en formato e621, para no tener que escribirlos manualmente.

#### Acceptance Criteria

1. WHEN el Publish_Panel se abre, THE Tag_Generator SHALL identificar el High_Res_Attachment de la tarea seleccionando el adjunto cuyo campo `type` comienza con `image/` y que tenga el mayor valor numérico en el campo `size` entre todos los adjuntos de la tarea.
2. IF la tarea no tiene ningún adjunto cuyo `type` comience con `image/`, THEN THE Tag_Generator SHALL omitir la llamada a la API de OpenAI y mostrar el mensaje "No hay imagen adjunta para analizar." en el área de tags del Publish_Panel, dejándola vacía y editable.
3. WHEN el High_Res_Attachment es identificado, THE Tag_Generator SHALL enviar la URL pública de la imagen a la OpenAI Vision API (modelo `gpt-4o`) con un prompt especializado que solicite tags en las categorías: `species`, `character`, `artist`, `general`, `copyright` y `meta`. El array resultante SHALL contener entre 1 y 200 tags.
4. WHEN la OpenAI Vision API devuelve una respuesta exitosa, THE Tag_Generator SHALL parsear los tags resultantes aplicando la normalización definida en el criterio 7, produciendo un array de strings. El array resultante SHALL contener entre 1 y 200 tags.
5. WHEN los tags son parseados, THE Tag_Generator SHALL reemplazar cualquier contenido previo del área editable de tags del Publish_Panel con los tags generados.
6. IF la OpenAI Vision API devuelve un error HTTP o no responde en 15 segundos, THEN THE Tag_Generator SHALL mostrar el mensaje "No se pudieron generar tags automáticamente. Puedes agregar tags manualmente." en el Publish_Panel y dejar el área de tags vacía y editable.
7. IF la API Key de OpenAI no está configurada en el AppConfig_Store, THEN THE Tag_Generator SHALL mostrar el mensaje "Configura tu API Key de OpenAI en Conexiones para usar esta función." y omitir la llamada a la API.
8. THE Tag_Generator SHALL normalizar cada tag convirtiéndolo a minúsculas y reemplazando cualquier secuencia de espacios por un único guión bajo antes de mostrarlo o guardarlo. Esta regla es la única fuente de verdad para la normalización de tags en todo el pipeline.
9. WHEN el artista escribe o edita manualmente un tag en el área editable del Publish_Panel y confirma la entrada (tecla Enter o foco fuera del campo), THE Publish_Panel SHALL aplicar la misma normalización del criterio 8 al tag ingresado y actualizar el valor visible de forma inmediata.

---

### Requirement 3: Panel de publicación (Publish_Panel)

**User Story:** Como artista, quiero un panel que me muestre la obra, los tags generados, y las plataformas disponibles, para revisar y personalizar cada publicación antes de enviarla.

#### Acceptance Criteria

1. WHEN el Publish_Panel se abre, THE Publish_Panel SHALL mostrar una previsualización del High_Res_Attachment ajustada a los límites del panel sin desbordamiento (object-fit: contain).
2. WHEN el Publish_Panel se abre, THE Publish_Panel SHALL mostrar un campo de texto editable pre-rellenado con el nombre de la tarea (`task.text`) como título de la publicación.
3. WHEN el Publish_Panel se abre, THE Publish_Panel SHALL mostrar un área de texto editable para la descripción de la publicación, inicialmente vacía.
4. WHEN el Publish_Panel se abre, THE Publish_Panel SHALL mostrar el área editable de tags con los tags generados por el Tag_Generator, permitiendo agregar, editar y eliminar tags individualmente. El área SHALL aceptar un máximo de 200 tags simultáneamente.
5. WHEN el artista modifica los tags en el Publish_Panel, THE Publish_Panel SHALL actualizar `fields.publishTags` en el taskStore para la tarea correspondiente, persistiendo los cambios. Los cambios de tags SE PERSISTIRÁN aunque el artista cierre el panel.
6. WHEN el Publish_Panel se abre, THE Publish_Panel SHALL mostrar un indicador de carga mientras espera la respuesta de `GET /api/account` en la URL del PostyBirb configurado.
7. WHEN `GET /api/account` responde exitosamente, THE Publish_Panel SHALL reemplazar el indicador de carga con la lista de Platform_Accounts disponibles, cada una con un checkbox de selección.
8. IF la llamada a `GET /api/account` falla o la Cloudflare_Tunnel URL no está configurada, THEN THE Publish_Panel SHALL mostrar el mensaje "No se pudo conectar con PostyBirb. Verifica la URL en Conexiones." y deshabilitar el botón "Publicar ahora".
9. IF hay al menos una Platform_Account seleccionada y no existe ningún error de conexión activo, THEN THE Publish_Panel SHALL habilitar el botón "Publicar ahora".
10. IF ninguna Platform_Account está seleccionada o existe un error de conexión activo, THEN THE Publish_Panel SHALL mantener el botón "Publicar ahora" deshabilitado.
11. WHEN el artista hace clic en el botón "✕" o en el overlay fuera del panel, THE Publish_Panel SHALL cerrarse. Los cambios de tags ya persistidos en `fields.publishTags` se mantendrán; los cambios en título y descripción que no hayan sido confirmados con "Publicar ahora" se descartarán.
12. IF el número de tags en el área editable alcanza 200, THEN THE Publish_Panel SHALL deshabilitar la entrada de nuevos tags y mostrar la advertencia "Has alcanzado el máximo de 200 tags."

---

### Requirement 4: Envío a PostyBirb

**User Story:** Como artista, quiero que al hacer clic en "Publicar ahora" se envíe todo a PostyBirb automáticamente, para no tener que repetir el proceso manualmente en cada plataforma.

#### Acceptance Criteria

1. WHEN el artista hace clic en "Publicar ahora", THE Publish_Panel SHALL verificar que: (a) el título no esté vacío, (b) haya al menos una Platform_Account seleccionada, y (c) haya al menos un tag. IF alguna condición no se cumple, THE Publish_Panel SHALL mostrar un mensaje de validación específico y no iniciar el envío.
2. WHEN la validación del criterio 1 es exitosa, THE Publish_Panel SHALL descargar el High_Res_Attachment desde R2 (timeout máximo de 30 segundos) y enviarlo a `POST /submissions` de PostyBirb como multipart/form-data con el archivo, el título y la descripción.
3. WHEN `POST /submissions` devuelve un ID de submission exitoso, THE Publish_Panel SHALL llamar a `PATCH /submissions/:id` con los tags finales (normalizados según criterio 8 de Req. 2) y los IDs de las Platform_Accounts seleccionadas.
4. WHEN `PATCH /submissions/:id` responde exitosamente, THE Publish_Panel SHALL llamar a `POST /submissions/:id/queue` para encolar la publicación en PostyBirb.
5. WHEN `POST /submissions/:id/queue` responde exitosamente, THE Publish_Panel SHALL crear un Publication_Record con estado `queued` y guardarlo según los criterios de Requirement 7.
6. WHEN el Publication_Record es creado con estado `queued`, THE Publish_Panel SHALL mostrar el mensaje "✅ Obra enviada a PostyBirb correctamente" y cerrarse automáticamente tras 2 segundos.
7. IF cualquier llamada a la API de PostyBirb devuelve un error HTTP (4xx o 5xx), THEN THE Publish_Panel SHALL extraer el mensaje de error de la respuesta JSON (campo `message` o el body completo si no es JSON), mostrarlo al artista, crear un Publication_Record con estado `error` y mantener el panel abierto para que el artista pueda reintentar.
8. IF la descarga del High_Res_Attachment desde R2 falla o supera el timeout de 30 segundos, THEN THE Publish_Panel SHALL mostrar "Error al obtener la imagen desde el almacenamiento. Intenta de nuevo." y no continuar con el envío.
9. WHILE cualquier petición del flujo de envío está en progreso, THE Publish_Panel SHALL mostrar un indicador de carga y mantener el botón "Publicar ahora" deshabilitado.
10. WHEN el flujo de envío termina (con éxito o con error), THE Publish_Panel SHALL re-habilitar el botón "Publicar ahora" solo si el resultado fue un error (para permitir reintento); si fue exitoso, el panel se cerrará según criterio 6.
11. THE Publish_Panel SHALL asociar cada Publication_Record con el `taskId` de la comisión de origen y la fecha y hora UTC del envío.

---

### Requirement 5: Historial de publicaciones (Publication_History)

**User Story:** Como artista, quiero una sección "Publicaciones" en el sidebar que muestre el historial de obras enviadas a PostyBirb con su estado, para hacer seguimiento de lo que ya publiqué.

#### Acceptance Criteria

1. THE Sidebar SHALL mostrar una entrada de navegación "📣 Publicaciones" que lleve a la Publication_History.
2. WHEN el artista navega a Publication_History, THE Publication_History SHALL intentar cargar los Publication_Records desde Supabase. IF la carga falla, THE Publication_History SHALL mostrar los registros disponibles en localStorage y un aviso "Mostrando datos locales — reconecta para sincronizar."
3. WHEN un Publication_Record es mostrado, THE Publication_History SHALL mostrar: miniatura de la imagen (o un placeholder gris con ícono 🖼 si no hay imageUrl), nombre de la comisión de origen, plataformas destino (lista separada por comas), estado (`queued` / `published` / `error`) y fecha de envío en formato `DD/MM/YYYY HH:mm` en la zona horaria local del navegador.
4. WHEN un Publication_Record tiene estado `error`, THE Publication_History SHALL mostrar el campo `errorMessage` del registro debajo del nombre de la comisión.
5. IF no existen Publication_Records (ni en Supabase ni en localStorage), THEN THE Publication_History SHALL mostrar el mensaje "Aún no has enviado ninguna publicación a PostyBirb."
6. WHEN el artista hace clic en un Publication_Record y el `taskId` del registro corresponde a una tarea que existe en el estado actual del Kanban, THE Publication_History SHALL navegar a la vista del Kanban y resaltar la tarjeta correspondiente.
7. IF el `taskId` de un Publication_Record no corresponde a ninguna tarea existente en el Kanban, THEN THE Publication_History SHALL renderizar ese registro con el botón de navegación deshabilitado y un tooltip "La comisión ya no existe en el tablero."

---

### Requirement 6: Configuración de PostyBirb y OpenAI en Conexiones

**User Story:** Como artista, quiero configurar la URL de PostyBirb, la API Key de PostyBirb (opcional) y la API Key de OpenAI en la página de Conexiones, para que el pipeline funcione sin modificar código.

#### Acceptance Criteria

1. THE ConnectionsPage SHALL mostrar una nueva sección "PostyBirb" con un campo de texto para la Cloudflare_Tunnel URL y un campo de contraseña opcional para la API Key de PostyBirb.
2. WHEN el artista guarda la configuración de PostyBirb, THE ConnectionsPage SHALL persistir la Cloudflare_Tunnel URL y la API Key en el AppConfig_Store mediante `setConfig()` y sincronizar con el perfil en Supabase.
3. WHEN el artista hace clic en "🧪 Probar conexión" en la sección PostyBirb y la respuesta es exitosa, THE ConnectionsPage SHALL mostrar "✅ PostyBirb conectado — N plataformas disponibles". IF la prueba falla, THE ConnectionsPage SHALL mostrar únicamente el mensaje de error correspondiente.
4. IF la prueba de conexión a PostyBirb falla, THEN THE ConnectionsPage SHALL mostrar "❌ No se pudo conectar. Verifica que el Cloudflare Tunnel esté activo y la URL sea correcta."
5. THE ConnectionsPage SHALL mostrar una sección "OpenAI (Generación de Tags)" con un campo de contraseña para la API Key de OpenAI.
6. WHEN el artista guarda la API Key de OpenAI, THE ConnectionsPage SHALL persistirla en el AppConfig_Store y sincronizarla con Supabase de la misma forma que las demás credenciales.
7. THE ConnectionsPage SHALL mostrar un enlace de ayuda "¿Cómo configurar el Cloudflare Tunnel?" que lleve a la documentación relevante.
8. IF la Cloudflare_Tunnel URL no comienza con `https://`, THEN THE ConnectionsPage SHALL mostrar la advertencia "La URL debe usar HTTPS para funcionar correctamente." y no guardar la configuración.

---

### Requirement 7: Persistencia de Publication_Records

**User Story:** Como artista, quiero que el historial de publicaciones sea persistente entre sesiones y dispositivos, para no perder el registro de mis publicaciones.

#### Acceptance Criteria

1. THE Publication_Record SHALL contener exactamente los campos: `id` (UUID v4), `taskId` (string), `taskName` (string), `imageUrl` (string, URL pública en R2), `platforms` (array de strings con los nombres de las plataformas), `status` (`'queued'` | `'published'` | `'error'`), `errorMessage` (string | null), `postybirbSubmissionId` (string), `sentAt` (string ISO-8601 UTC) y `userId` (string, el ID del artista autenticado).
2. WHEN un Publication_Record es creado, THE Pipeline SHALL ejecutar un upsert en la tabla `publications` de Supabase usando `id` como clave de conflicto, dentro de los 2 segundos siguientes a la confirmación del envío exitoso a PostyBirb.
3. IF el upsert de Supabase falla con cualquier error de red o de servidor, THEN THE Pipeline SHALL guardar el registro en localStorage bajo la clave `publication_records_<userId>` como array JSON y programar reintentos cada 60 segundos hasta que el upsert tenga éxito, independientemente de si la conectividad de red se restaura antes de que el reintento se ejecute.
4. THE Pipeline SHALL actualizar el campo `status` de un Publication_Record existente únicamente mediante una operación de patch explícita (PATCH /publications/:id en la capa de datos), nunca reemplazando el registro completo. El resto de campos del registro SHALL permanecer inmutables tras la creación.
5. WHEN el artista cierra sesión, THE Pipeline SHALL eliminar de memoria (React state y caché en memoria) todos los Publication_Records cargados, pero SHALL mantener los registros persistidos en localStorage bajo la clave `publication_records_<userId>` y en Supabase sin modificación.

---

### Requirement 8: Seguridad y manejo de credenciales

**User Story:** Como artista, quiero que mis API Keys y credenciales de PostyBirb estén protegidas, para evitar que sean expuestas en la UI o en logs.

#### Acceptance Criteria

1. THE ConnectionsPage SHALL renderizar los campos de API Key de OpenAI y API Key de PostyBirb como inputs de tipo `password` (con caracteres enmascarados).
2. THE AppConfig_Store SHALL persistir las API Keys en el perfil de Supabase usando las columnas `openai_api_key` y `postybirb_api_key` con Row Level Security activa, de modo que solo el artista autenticado pueda leer sus propias keys.
3. THE Tag_Generator SHALL incluir la API Key de OpenAI únicamente en el header `Authorization: Bearer <key>` de cada petición. THE Tag_Generator SHALL garantizar que la API Key no aparezca en ninguna URL, cuerpo de petición, respuesta ni log.
4. WHEN el Publish_Panel llama a la API de PostyBirb, THE Publish_Panel SHALL incluir la API Key de PostyBirb (si está configurada) en el header `X-API-Key` de cada petición.
5. THE Pipeline SHALL nunca registrar (console.log, console.error ni Supabase) el valor completo de ninguna API Key; solo puede registrar los primeros 4 caracteres seguidos de `***` para diagnóstico.
