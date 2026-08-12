# Implementation Plan: Artwork Publish Pipeline

## Overview

Implementación del pipeline completo de publicación de obras de arte desde el Kanban hasta PostyBirb v4, incluyendo generación automática de tags con OpenAI Vision, historial de publicaciones en Supabase y configuración de credenciales en la página de Conexiones. La implementación sigue las capas existentes del proyecto: SQL migrations → lib (lógica de negocio) → componentes UI → modificaciones a archivos existentes → tests.

## Tasks

- [x] 1. Migraciones SQL de base de datos
  - [x] 1.1 Crear tabla `publications` en Supabase con RLS
    - Ejecutar el DDL completo de `publications` con todos los campos del schema: `id`, `user_id`, `task_id`, `task_name`, `image_url`, `platforms`, `status`, `error_message`, `postybirb_submission_id`, `sent_at`, `created_at`
    - Agregar `CHECK (status IN ('queued','published','error'))` en la columna `status`
    - Habilitar RLS y crear la policy `"users_own_publications"` con `auth.uid() = user_id`
    - Crear el archivo de migración en `supabase/migrations/` o documentar el SQL en un archivo `sql/publications.sql`
    - _Requerimientos: 7.1, 7.2, 8.2_

  - [x] 1.2 Agregar columnas de credenciales al perfil
    - Ejecutar `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postybirb_url TEXT`
    - Ejecutar `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postybirb_api_key TEXT`
    - Ejecutar `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS openai_api_key TEXT`
    - Verificar que RLS en `profiles` cubre las nuevas columnas (solo el usuario autenticado puede leer su propio perfil)
    - _Requerimientos: 6.1, 6.2, 8.2_

- [x] 2. Capa de configuración — `src/store/appConfig.js`
  - [x] 2.1 Agregar claves de configuración para PostyBirb y OpenAI
    - Añadir a `DEFAULTS`: `postybirbUrl: ''`, `postybirbApiKey: ''`, `openaiApiKey: ''`
    - Añadir a `syncToSupabase`: `postybirb_url`, `postybirb_api_key`, `openai_api_key` mapeando a las columnas correspondientes del perfil
    - Asegurar que al cargar el perfil desde Supabase en `AuthContext` se lean y persistan estas tres claves en localStorage
    - _Requerimientos: 6.2, 6.6, 8.2_

- [x] 3. Capa lib — `src/lib/postybirb.js`
  - [x] 3.1 Implementar cliente HTTP para PostyBirb v4
    - Crear `src/lib/postybirb.js` con las funciones: `getPostyBirbAccounts()`, `createSubmission(file, title, description)`, `updateSubmission(id, { tags, accountIds })`, `queueSubmission(id)`
    - Leer `postybirbUrl` y `postybirbApiKey` desde `getConfig()` al inicio de cada función
    - Agregar el header `X-API-Key` **solo si** `postybirbApiKey` está configurada (no enviar header vacío)
    - Implementar timeout de 30 segundos mediante `AbortController` en todas las funciones
    - Lanzar un error que incluya el mensaje extraído del body JSON (`error.message` o body completo) en cualquier respuesta no-2xx
    - Definir el tipo `Platform_Account = { id: string, website: string, name: string }`
    - _Requerimientos: 3.6, 3.7, 3.8, 4.2, 4.3, 4.4, 8.4_

- [x] 4. Capa lib — `src/lib/tagGenerator.js`
  - [x] 4.1 Implementar generador de tags con OpenAI Vision
    - Crear `src/lib/tagGenerator.js` con la función principal `generateTags(imageUrl)` y la función pura exportada `normalizeTag(s)`
    - `normalizeTag`: aplicar `s.toLowerCase().replace(/\s+/g, '_')` — esta es la única fuente de verdad para normalización
    - `generateTags`: leer `openaiApiKey` de `getConfig()`; si no está configurada, lanzar un `ConfigError` con el mensaje "Configura tu API Key de OpenAI en Conexiones para usar esta función."
    - Llamar a `https://api.openai.com/v1/chat/completions` con modelo `gpt-4o`, `max_tokens: 500`, prompt especializado solicitando tags e621 en categorías: `species`, `character`, `artist`, `general`, `copyright`, `meta`
    - Incluir la API Key **solo** en el header `Authorization: Bearer <key>` — nunca en URL ni en body
    - Implementar timeout de 15 segundos con `AbortController`
    - Parsear la respuesta extrayendo tags de texto libre (líneas o comas), aplicar `normalizeTag` a cada uno, filtrar vacíos y limitar a máximo 200 tags
    - Log de diagnóstico: solo los primeros 4 caracteres de la key seguidos de `***`, nunca el valor completo
    - _Requerimientos: 2.1, 2.3, 2.4, 2.6, 2.7, 2.8, 8.3, 8.5_

  - [x] 4.2 Implementar función de selección del High_Res_Attachment
    - Dentro de `tagGenerator.js`, exportar la función `identifyHighResAttachment(attachments)`
    - Filtrar los adjuntos cuyo `type` comienza con `'image/'` y retornar el que tenga el mayor valor numérico en `size`
    - Si no existe ningún adjunto imagen, retornar `null`
    - _Requerimientos: 2.1, 2.2_

- [x] 5. Tests de propiedades con fast-check
  - [x] 5.1 Instalar fast-check como dependencia de desarrollo
    - Ejecutar `npm install --save-dev fast-check` en el directorio raíz del proyecto
    - Verificar que la dependencia aparece en `devDependencies` de `package.json`
    - _Requerimientos: N/A (infraestructura de testing)_

  - [x]* 5.2 Property 4: Idempotencia de `normalizeTag`
    - **Property 4: `normalizeTag(normalizeTag(s)) === normalizeTag(s)` para cualquier string `s`. El resultado no debe contener mayúsculas ni espacios.**
    - **Validates: Requirements 2.8, 2.9**
    - Crear `src/lib/__tests__/tagGenerator.property.test.js`
    - Usar `fc.string()` como generador; ejecutar con `numRuns: 100`
    - Comentario de trazabilidad: `// Feature: artwork-publish-pipeline, Property 4: Idempotencia de normalizeTag`

  - [x]* 5.3 Property 3: Selección del High_Res_Attachment
    - **Property 3: Para cualquier array con al menos un adjunto imagen, `identifyHighResAttachment` retorna el adjunto con el mayor `size`.**
    - **Validates: Requirements 2.1**
    - Usar `fc.array(fc.record({ type: fc.constant('image/jpeg'), size: fc.nat(), id: fc.uuid() }), { minLength: 1 })`
    - Comentario: `// Feature: artwork-publish-pipeline, Property 3: Selección del High_Res_Attachment`

  - [x]* 5.4 Property 5: Límite de 200 tags
    - **Property 5: Si el array de entrada tiene más de 200 elementos, el pipeline produce exactamente 200 tags. Si tiene ≤ 200, produce exactamente `n` tags.**
    - **Validates: Requirements 2.3, 2.4, 3.4, 3.12**
    - Probar la función de recorte interna de `tagGenerator.js` con `fc.array(fc.string(), { minLength: 0, maxLength: 250 })`
    - Comentario: `// Feature: artwork-publish-pipeline, Property 5: Límite de 200 tags`

  - [x]* 5.5 Property 7: Validación de precondiciones de envío
    - **Property 7: Cualquier combinación con título vacío, 0 cuentas seleccionadas o 0 tags debe rechazar el envío y no llamar a ninguna API de PostyBirb.**
    - **Validates: Requirements 4.1**
    - Exportar la función de validación `validatePublishInputs({ title, selectedAccounts, tags })` desde `PublishPanel.jsx` para poder testearla de forma aislada
    - Usar `fc.record` con al menos una condición inválida activa
    - Comentario: `// Feature: artwork-publish-pipeline, Property 7: Validación de precondiciones`

  - [x]* 5.6 Property 8: Integridad del schema de Publication_Record
    - **Property 8: Todo `Publication_Record` creado por el pipeline contiene exactamente los campos requeridos y `status` es uno de `['queued', 'published', 'error']`.**
    - **Validates: Requirements 7.1**
    - Crear `src/lib/__tests__/publicationsDb.property.test.js`
    - Usar `fc.record({ taskId: fc.uuid(), taskName: fc.string({ minLength: 1 }), imageUrl: fc.webUrl(), ... })`
    - Comentario: `// Feature: artwork-publish-pipeline, Property 8: Integridad del schema`

  - [x]* 5.7 Property 9: Inmutabilidad de campos al actualizar status
    - **Property 9: Aplicar un patch de `status` sobre un `Publication_Record` deja todos los demás campos con sus valores originales.**
    - **Validates: Requirements 7.4**
    - Comentario: `// Feature: artwork-publish-pipeline, Property 9: Inmutabilidad en patch de status`

- [x] 6. Capa lib — `src/lib/publicationsDb.js`
  - [x] 6.1 Implementar la capa de datos para `Publication_Record`
    - Crear `src/lib/publicationsDb.js` siguiendo el patrón de `src/store/archiveDb.js`
    - Implementar `savePublication(record)`: (1) guardar síncronamente en `localStorage['publication_records_<userId>']` como array JSON, (2) hacer upsert en Supabase con `id` como clave de conflicto, (3) si Supabase falla, programar reintentos cada 60 segundos con `setInterval` que se limpia tras éxito
    - Implementar `loadPublications()`: intentar Supabase primero; si falla, retornar desde localStorage y señalar el origen con un campo `_fromLocalStorage: true`
    - Implementar `clearPublicationsCache()`: limpiar el estado en memoria (sin borrar localStorage ni Supabase), llamado desde el flujo de logout en `AuthContext`
    - Implementar `patchPublicationStatus(id, status)`: actualizar solo `status` (y opcionalmente `errorMessage`) sin reemplazar el registro completo
    - Los registros en Supabase mapean: `task_id` ↔ `taskId`, `task_name` ↔ `taskName`, etc. (snake_case en DB, camelCase en app)
    - _Requerimientos: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7. Checkpoint — Verificar capa lib
  - Asegurar que todos los tests de propiedades y unidad de `tagGenerator.js` y `publicationsDb.js` pasan. Preguntar al usuario si surgen dudas sobre la integración con Supabase o R2.

- [x] 8. Componente UI — `src/components/PublishPanel.jsx`
  - [x] 8.1 Crear la estructura base del modal overlay
    - Crear `src/components/PublishPanel.jsx` con props `{ taskId, task, fields, onClose }`
    - Aplicar `position: fixed`, z-index elevado, overlay semitransparente que se cierra al hacer clic fuera
    - Layout de dos columnas: columna izquierda para preview de imagen (`object-fit: contain`, `max-height: 400px`), columna derecha para formulario
    - Botón ✕ en la esquina superior que llama a `onClose`
    - _Requerimientos: 3.1, 3.11_

  - [x] 8.2 Implementar carga inicial: identificación de imagen, tags y cuentas
    - En `useEffect` al montar, llamar `identifyHighResAttachment(fields.attachments)` para determinar la imagen de alta resolución
    - Ejecutar en paralelo `generateTags(highResUrl)` y `getPostyBirbAccounts()` con `Promise.all`
    - Mostrar indicadores de carga individuales para tags y cuentas mientras se espera
    - Pre-rellenar el campo título con `task.text` y dejar descripción vacía
    - Manejar todos los casos de error definidos en requirements 2.2, 2.6, 2.7, 3.8
    - _Requerimientos: 2.2, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.6, 3.7, 3.8_

  - [x] 8.3 Implementar área de tags con chips editables
    - Renderizar cada tag como un chip con botón ✕ para eliminarlo individualmente
    - Campo de entrada para agregar tags: aplicar `normalizeTag()` al confirmar con Enter o blur
    - Persistir cambios en `fields.publishTags` vía `updateField(taskId, 'publishTags', tags)` en cada modificación
    - Cuando `tags.length >= 200`: deshabilitar el campo de entrada y mostrar "Has alcanzado el máximo de 200 tags."
    - Botón "🔄 Regenerar tags" que vuelve a llamar a `generateTags`
    - _Requerimientos: 3.4, 3.5, 3.12, 2.9_

  - [x] 8.4 Implementar selección de plataformas y validación de envío
    - Exportar la función pura `validatePublishInputs({ title, selectedAccounts, tags })` para testing
    - Renderizar lista de `Platform_Account` con checkboxes; habilitar "📤 Publicar ahora" solo si hay ≥ 1 cuenta seleccionada, título no vacío y ≥ 1 tag
    - Mostrar mensajes de validación específicos si alguna condición no se cumple (AC 4.1)
    - _Requerimientos: 3.9, 3.10, 4.1_

  - [x] 8.5 Implementar el flujo de envío a PostyBirb
    - Al hacer clic en "📤 Publicar ahora": (1) descargar blob desde R2 con timeout 30s, (2) `createSubmission`, (3) `updateSubmission` con tags y accountIds, (4) `queueSubmission`, (5) `savePublication` con `status: 'queued'`
    - Mostrar indicador de progreso de 3 pasos: "⬆ Subiendo imagen...", "⚙ Configurando publicación...", "📬 Encolando en PostyBirb..."
    - Deshabilitar el botón "Publicar ahora" durante todo el flujo
    - Al éxito: mostrar "✅ Obra enviada a PostyBirb correctamente" y cerrar el panel tras 2 segundos
    - Al error en cualquier paso: extraer mensaje del body JSON, mostrarlo, crear `Publication_Record` con `status: 'error'`, mantener panel abierto y re-habilitar el botón para reintento
    - Si la descarga R2 falla o supera timeout: mostrar "Error al obtener la imagen desde el almacenamiento. Intenta de nuevo." y no continuar
    - Asociar cada `Publication_Record` con `taskId` y la fecha/hora UTC del envío
    - _Requerimientos: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_

- [x] 9. Página UI — `src/pages/PublicationsPage.jsx`
  - [x] 9.1 Crear la página de historial de publicaciones
    - Crear `src/pages/PublicationsPage.jsx` que llama a `loadPublications()` en el montaje
    - Renderizar cada `Publication_Record` como tarjeta con: miniatura 60×60 (placeholder gris con `🖼` si no hay `imageUrl`), nombre de comisión, plataformas como chips separados por coma, badge de estado (`queued` / `published` / `error`), fecha en formato `DD/MM/YYYY HH:mm` (timezone del navegador)
    - Si `status === 'error'`: mostrar `errorMessage` debajo del nombre
    - Si `taskId` existe en `rawTasks` del store: botón "Ver en tablero" → navegar a `/studio`
    - Si `taskId` no existe en el store: botón deshabilitado con `title="La comisión ya no existe en el tablero."`
    - Empty state: "Aún no has enviado ninguna publicación a PostyBirb."
    - Banner offline si la carga vino de localStorage: "Mostrando datos locales — reconecta para sincronizar."
    - Header de página siguiendo la estructura visual de `ConnectionsPage` (`.page`, `.page-header`, `.page-body`)
    - _Requerimientos: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 10. Modificaciones a archivos existentes
  - [x] 10.1 Actualizar `src/store/appConfig.js`
    - Ya cubierto en tarea 2.1 — verificar que los cambios están aplicados y que `syncToSupabase` incluye las tres nuevas claves
    - _Requerimientos: 6.2, 6.6_

  - [x] 10.2 Agregar ítem de navegación en `src/components/Sidebar.jsx`
    - Insertar `{ id: 'publications', icon: '📣', label: 'Publicaciones' }` al array `NAV_ITEMS` después de `calendar` o en la posición que corresponda al flujo de trabajo del artista
    - _Requerimientos: 5.1_

  - [x] 10.3 Agregar ruta de publicaciones en `src/App.jsx`
    - Agregar import: `import PublicationsPage from './pages/PublicationsPage.jsx'`
    - En `ROUTE_TO_PAGE`: `'/publications': 'publications'`
    - En `PAGE_TO_ROUTE`: `publications: '/publications'`
    - En `<Routes>`: `<Route path="/publications" element={<PublicationsPage />} />`
    - _Requerimientos: 5.1_

  - [x] 10.4 Modificar `src/components/KanbanBoard.jsx` para montar el PublishPanel
    - En el componente `KanbanBoard`, agregar estado `const [publishPanelTaskId, setPublishPanelTaskId] = useState(null)`
    - Pasar el callback `onOpenPublishPanel={(taskId) => setPublishPanelTaskId(taskId)}` hasta `KanbanCard` a través de `KanbanColumn`
    - Montar `<PublishPanel>` como sibling del board (fuera de las columnas) cuando `publishPanelTaskId !== null`; cerrar con `setPublishPanelTaskId(null)`
    - Si ya hay un panel abierto y se hace clic en otra tarjeta, cerrar el anterior y abrir el nuevo en el mismo ciclo (comportamiento de reemplazo inmediato)
    - En `KanbanCard`, después del bloque de pills, agregar la sección de publicación condicional:
      - Renderizar el botón solo cuando `fields.stage === 'delivered'`
      - `disabled` cuando ningún adjunto tiene `type?.startsWith('image/')`, con `title="Adjunta la imagen final antes de publicar"`
      - `onClick` llama a `onOpenPublishPanel(task.id)` y hace `e.stopPropagation()`
    - _Requerimientos: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 10.5 Agregar secciones PostyBirb y OpenAI en `src/pages/ConnectionsPage.jsx`
    - Agregar estado local para los nuevos campos: `postybirbUrl`, `postybirbApiKey`, `openaiApiKey`, estado de guardado y resultado de prueba
    - En `useEffect` inicial, leer las claves desde `getConfig()` para pre-rellenar los campos
    - **Sección PostyBirb**: input URL (`type="text"`), input API Key (`type="password"` — opcional), botón "💾 Guardar" con validación de `https://` (mostrar "La URL debe usar HTTPS para funcionar correctamente." si no cumple, y NO guardar), botón "🧪 Probar conexión" que llama a `getPostyBirbAccounts()`, link de ayuda "¿Cómo configurar el Cloudflare Tunnel?" → `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/`
    - Resultado de prueba exitosa: "✅ PostyBirb conectado — N plataformas disponibles"; fallo: "❌ No se pudo conectar. Verifica que el Cloudflare Tunnel esté activo y la URL sea correcta."
    - **Sección OpenAI**: input API Key (`type="password"`), botón "💾 Guardar" → `setConfig('openaiApiKey', key)`
    - Al guardar, llamar a `setConfig` con los valores correspondientes (persiste en localStorage y sincroniza con Supabase)
    - _Requerimientos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 8.1_

- [x] 11. Tests de propiedades — componentes UI
  - [x]* 11.1 Property 1: Visibilidad del botón de publicación
    - **Property 1: El botón "📢 Preparar publicación" se renderiza si y solo si `fields.stage === 'delivered'`.**
    - **Validates: Requirements 1.1, 1.2**
    - Crear `src/components/__tests__/KanbanCard.property.test.jsx`
    - Usar `fc.constantFrom('delivered', 'sketch', 'wip', 'review', 'new', 'finished')` para generar stages arbitrarios
    - Comentario: `// Feature: artwork-publish-pipeline, Property 1: Visibilidad del botón`

  - [x]* 11.2 Property 2: Botón `disabled` sin adjunto imagen
    - **Property 2: Con `stage === 'delivered'`, el botón tiene `disabled === true` si y solo si ningún adjunto tiene `type` comenzando con `'image/'`.**
    - **Validates: Requirements 1.5**
    - Usar `fc.array(fc.record({ type: fc.string(), size: fc.nat(), id: fc.uuid() }))` para generar listas de adjuntos arbitrarias
    - Comentario: `// Feature: artwork-publish-pipeline, Property 2: Estado disabled del botón`

  - [x]* 11.3 Property 6: Round-trip de persistencia de `publishTags`
    - **Property 6: `updateField(taskId, 'publishTags', tags)` seguido de `getFields(taskId).publishTags` retorna el mismo array.**
    - **Validates: Requirements 3.5**
    - Crear `src/store/__tests__/taskStore.property.test.js`
    - Usar `fc.array(fc.string().map(s => s.toLowerCase().replace(/\s+/g, '_')))` para generar arrays de tags normalizados
    - Comentario: `// Feature: artwork-publish-pipeline, Property 6: Round-trip de publishTags`

- [x] 12. Checkpoint final — Verificar integración completa
  - Ejecutar `npm test -- --run` para asegurar que todos los tests pasan
  - Verificar que el flujo completo (botón Kanban → PublishPanel → envío → historial) funciona con mocks de PostyBirb y Supabase
  - Preguntar al usuario si surgen dudas antes de dar por completada la implementación.

- [x] 13. Tests de integración
  - [x]* 13.1 Test de flujo feliz completo con PostyBirb mockeado
    - Crear `src/__tests__/publishPipeline.integration.test.js`
    - Mockear los tres endpoints de PostyBirb (`POST /submissions`, `PATCH /submissions/:id`, `POST /submissions/:id/queue`) con `vi.mock` o `msw`
    - Verificar que se llaman en orden correcto y que el `Publication_Record` resultante tiene `status: 'queued'`
    - _Requerimientos: 4.2, 4.3, 4.4, 4.5_

  - [x]* 13.2 Test de fallback localStorage cuando Supabase falla
    - Mockear `supabase.from('publications').upsert` para que lance un error de red
    - Verificar que el registro queda guardado en `localStorage['publication_records_<userId>']`
    - Verificar que se programa un reintento (stub de `setInterval`)
    - _Requerimientos: 7.3_

  - [x]* 13.3 Test de error en step PATCH (error en PostyBirb)
    - Mockear `PATCH /submissions/:id` para que devuelva un error 422 con `{ message: "Tag too long" }`
    - Verificar que se crea un `Publication_Record` con `status: 'error'` y `errorMessage: "Tag too long"`
    - _Requerimientos: 4.7_

  - [x]* 13.4 Test de URL PostyBirb sin https://
    - Simular que el usuario ingresa `http://postybirb.example.com` y hace clic en "Guardar"
    - Verificar que `ConnectionsPage` muestra la advertencia y no llama a `setConfig`
    - _Requerimientos: 6.8_

## Notes

- Las tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido
- El orden de las tareas garantiza que cada capa esté lista antes de que la siguiente dependa de ella
- Los tests de propiedades validan correctness universal; los de integración validan flujos end-to-end con mocks
- La función `normalizeTag` debe ser la única fuente de verdad para normalización — nunca duplicar la lógica
- Los campos API Key **nunca** deben aparecer en logs completos; solo los primeros 4 caracteres + `***`
- El `PublishPanel` comparte `normalizeTag` importándola de `tagGenerator.js`, no redefiniéndola

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1", "4.2"] },
    { "id": 3, "tasks": ["5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["8.1", "8.2", "9.1", "10.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["8.3", "8.4", "10.4", "10.5"] },
    { "id": 7, "tasks": ["8.5"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "13.4"] }
  ]
}
```
