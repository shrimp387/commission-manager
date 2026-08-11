# Auditoría del Proyecto — Estudio de Comisiones
Última actualización: v1.9.3 | 2026-08-10

---

## ✅ ESTADO ACTUAL — Todo lo completado

### Infraestructura y base
- [x] Google OAuth (Supabase Auth) funcional ✅
- [x] Cloudflare R2 para imágenes — portafolio, adjuntos ✅
- [x] Worker R2 con CORS para todos los deploys de Vercel ✅
- [x] Supabase como única fuente de verdad (Taskade eliminado) ✅
- [x] React Router v6 con hash routing — URLs por página ✅
- [x] Multi-usuario con aislamiento de datos ✅

### Sincronización de datos
- [x] Portafolio: R2 (imágenes) + Supabase (metadatos) + recovery automático ✅
- [x] Tareas: 100% Supabase (text, parentId, campos) ✅
- [x] Solicitudes de comisión: Supabase ✅
- [x] Formulario público → Supabase ✅
- [x] Archivados: Supabase ✅
- [x] Configuración visual (profiles): Supabase ✅
- [x] Kanban config: Supabase ✅
- [x] Telegram config: Supabase (profiles.telegram_token) ✅
- [x] Gmail tokens: Supabase (profiles.gmail_tokens) ✅
- [x] UI prefs (view mode, header): Supabase (profiles.ui_prefs) ✅
- [x] Guía del estudio: Supabase ✅
- [x] Attachments: R2 + recovery desde R2 al login ✅
- [x] Clientes: Supabase (tabla clients) ✅

### Bugs corregidos
- [x] Timer debounce 30s (antes 1 upsert/seg) ✅
- [x] Dashboard métricas reales (avance, urgentes hoy) ✅
- [x] savePortfolio atómico con upsert ✅
- [x] Lightbox stale closure ✅
- [x] task_fields cleanup al borrar tareas ✅
- [x] KanbanBoard escribe a Supabase (antes solo localStorage) ✅
- [x] Portafolio IDs con UUID válidos (antes float) ✅
- [x] Base64 cleanup en localStorage ✅

### Features implementadas
- [x] Buscador global Ctrl-K (tareas, solicitudes, portafolio, páginas) ✅
- [x] Notificaciones de deadline (hoy, mañana, vencidas) ✅
- [x] Base de datos de clientes con historial ✅
- [x] Auto-crear cliente al aceptar solicitud ✅
- [x] Generador PDF presupuesto/factura (jsPDF lazy load) ✅
- [x] Calendario de deadlines ✅
- [x] Storage Monitor (debug tool) ✅
- [x] Páginas sidebar: Media, Integraciones, Mapa DNA ✅

---

## 🔴 PENDIENTE — Lo que falta

### Fase 3 incompleta
- [ ] **Dashboard stats avanzadas** — ingresos totales, tiempo por comisión, tasa de conversión solicitudes→comisiones

### Fase 4 pendiente  
- [ ] **Automatizaciones** — página de reglas automáticas (ej: mover tarjeta al aceptar, enviar webhook al completar). Falta crear `AutomationsPage.jsx` y conectarla en `/#/automations`
- [ ] **Agentes de IA** — página con prompts útiles para artistas. Falta crear `AiAgentsPage.jsx` y conectarla en `/#/ai`

### Bugs menores pendientes
- [ ] `local_tasks` localStorage crece sin límite — falta limpiar tareas viejas no referenciadas en Supabase
- [ ] `insertPublicRequest` sin auth — si el artista NO está logueado cuando un cliente llena el formulario, falla silenciosamente

### Deuda técnica menor
- [ ] Chunk size warning (index.js 693KB) — añadir `manualChunks` en vite.config.js para separar vendor libs
- [ ] `ProximamentePanel.jsx` — ya no se usa, eliminar el componente
- [ ] `PLACEHOLDER_ITEMS` en Sidebar.jsx — array vacío ahora, limpiar

---

## 📋 PARA LA PRÓXIMA SESIÓN — Checklist de trabajo

Prioridad alta:
1. **Crear `AutomationsPage.jsx`** — reglas: "cuando se acepta solicitud → crear tarea en sección X", "cuando se completa tarea → archivar automáticamente"
2. **Crear `AiAgentsPage.jsx`** — prompts prediseñados para generar descripciones de comisiones, respuestas a clientes, tags de portafolio
3. **Dashboard stats avanzadas** — agregar a `StatsPage.jsx` los ingresos del histórico de archivados con payment_details

Prioridad media:
4. **vite.config.js manualChunks** — dividir bundle principal
5. **Limpiar ProximamentePanel** y PLACEHOLDER_ITEMS del Sidebar
6. **local_tasks cleanup** — limpiar entradas huérfanas

---

## 🗄 TABLAS SUPABASE EXISTENTES

| Tabla | Uso |
|---|---|
| `profiles` | Config visual, telegram_token, gmail_tokens, ui_prefs, sidebar_width |
| `tasks` | Estructura y campos de comisiones activas (text, parentId, attachments, etc.) |
| `commission_requests` | Solicitudes de clientes |
| `portfolio_items` | Metadatos de portafolio (URL viene de R2) |
| `archived_commissions` | Historial de comisiones completadas |
| `studio_guide` | Bloques del editor de guía |
| `kanban_config` | Columnas, colores, orden del kanban |
| `clients` | Base de datos de clientes con historial |

---

## 🌐 RUTAS DE LA APP (React Router hash)

| Ruta | Página | Estado |
|---|---|---|
| `/#/studio` | Estudio de Comisiones | ✅ Completo |
| `/#/requests` | Solicitudes de Comisión | ✅ Completo |
| `/#/clients` | Clientes | ✅ Completo |
| `/#/archived` | Archivados | ✅ Completo |
| `/#/portfolio` | Galería de Portafolio | ✅ Completo |
| `/#/calendar` | Calendario | ✅ Completo |
| `/#/guide` | Guía del Estudio | ✅ Completo |
| `/#/connections` | Conexiones (Telegram + Gmail) | ✅ Completo |
| `/#/media` | Medios de comunicación | ✅ Completo |
| `/#/integrations` | Integraciones | ✅ Completo |
| `/#/stats` | Mapa DNA / Stats | ✅ Completo |
| `/#/settings` | Configuración | ✅ Completo |
| `/#/automations` | Automatizaciones | ❌ Falta crear |
| `/#/ai` | Agentes de IA | ❌ Falta crear |

---

## 📦 VERSIONES DEL PROYECTO

| Versión | Cambio |
|---|---|
| v1.4.x | R2 storage inicial |
| v1.5.x | CORS Worker, Storage Monitor, UUID fix |
| v1.6.x | Telegram/Gmail a Supabase, GuidePage sync, portafolio upsert |
| v1.7.x | Sin Taskade, 100% Supabase, adjuntos desde R2 |
| v1.8.x | Buscador global, notificaciones deadline, React Router |
| v1.9.x | Clientes DB, PDF factura, Calendario, páginas sidebar |

Versión actual: **v1.9.3**
