# Auditoría del Proyecto — Estudio de Comisiones
Fecha: 2026-08-10 | Versión: v1.7.1

---

## Estado General
La app es funcional y está lista para producción en sus funciones core. La infraestructura (Supabase + R2 + Google Auth) está bien diseñada. Los problemas son deuda técnica acumulada de la plantilla original (Taskade) y features de UI que están visualmente presentes pero sin implementar.

---

## 🔴 Funciones visibles que NO hacen nada (stubs)

| # | Elemento | Dónde | Estado |
|---|---|---|---|
| 1 | **Buscador / Ctrl-K** | Sidebar | `readOnly` — no busca nada |
| 2 | **"✦ Abrir asistente"** | Header estudio | Sin handler — botón fantasma |
| 3 | **"⚙" configuración** | Header estudio | Sin handler |
| 4 | **"+2 más" pill** | Tarjetas kanban | Hardcodeado, no muestra nada |
| 5 | **"💳 Pagar y enviar solicitud"** | Formulario público | No hay integración de pago real |
| 6 | **Medios de comunicación** | Sidebar | Página inexistente |
| 7 | **Integraciones** | Sidebar | Página inexistente |
| 8 | **Agentes de IA** | Sidebar | Página inexistente |
| 9 | **Automatizaciones** | Sidebar | Página inexistente |
| 10 | **Mapa DNA** | Sidebar | Página inexistente |
| 11 | **"Agregar tarea arriba/abajo"** | Menú contexto tarjeta | Agrega al final en lugar de en posición indicada |

---

## 🟡 Bugs de datos

| # | Bug | Archivo | Prioridad | Estado |
|---|---|---|---|---|
| 1 | **Timer llama Supabase cada segundo** (1 upsert/seg por tarea activa) | `store/taskStore.js` | ALTA | ✅ Completado v1.7.2 |
| 2 | **`insertPublicRequest` no guarda en Supabase** — TODO en el código | `lib/db.js` | ALTA | ✅ Completado v1.7.2 |
| 3 | **Dashboard "AVANCE PROMEDIO" hardcodeado al 30%** | `components/Dashboard.jsx` | ALTA | ✅ Completado v1.7.2 |
| 4 | **Dashboard "ATENCIÓN HOY" = mismo valor que "ACTIVAS"** | `pages/StudioPage.jsx` | MEDIA | ✅ Completado v1.7.2 |
| 5 | **`savePortfolio` hace delete+insert no atómico** (riesgo de pérdida de datos) | `lib/db.js` | MEDIA | ⬜ Pendiente |
| 6 | **GuidePage guarda bloques solo a localStorage** — nunca a Supabase | `pages/GuidePage.jsx` | MEDIA | ⬜ Pendiente |

---

## 🟠 Deuda técnica / Arquitectura

| # | Problema | Impacto | Estado |
|---|---|---|---|
| 1 | **Sin router (React Router)** — browser back/forward roto, no hay deep links | ALTO | ⬜ Pendiente |
| 2 | **`task_fields` localStorage crece sin límite** — tareas antiguas nunca se limpian | MEDIO | ⬜ Pendiente |
| 3 | **`setTaskField` no debounceable** — cada cambio de campo = upsert inmediato | MEDIO | ⬜ Pendiente |
| 4 | **`local_tasks` localStorage** — sigue siendo la fuente de verdad offline, duplica Supabase | BAJO | ⬜ Pendiente |
| 5 | **`ProximamentePanel.jsx`** — componente vacío/placeholder sin uso real | BAJO | ⬜ Pendiente |
| 6 | **Lightbox en Portfolio** — closures stale en el keyboard handler (dep array vacío) | BAJO | ⬜ Pendiente |
| 7 | **`savePortfolio` no atómico** — delete + insert separados, fallo en medio = datos perdidos | MEDIO | ⬜ Pendiente |

---

## ✅ Features completamente funcionales

- Google OAuth (Supabase Auth) ✅
- Portafolio con R2 + recovery automático desde R2 ✅
- Kanban sincronizado a Supabase (sin Taskade) ✅
- Archivados persistentes ✅
- Configuración visual (profiles en Supabase) ✅
- Telegram config sincronizado a Supabase ✅
- Gmail OAuth + envío de emails ✅
- Sticker sets de Telegram ✅
- Adjuntos de tareas en R2 con recovery al login ✅
- Solicitudes de comisión en Supabase ✅
- Formulario público → Supabase ✅
- Storage Monitor (debug tool) ✅
- Multi-usuario con aislamiento de datos ✅

---

## 🔵 Features faltantes esperadas en un commission manager

| # | Feature | Complejidad | Prioridad |
|---|---|---|---|
| 1 | **Base de datos de clientes** — historial por cliente, contactos repetidos | Media | Alta |
| 2 | **Buscador global** — buscar por nombre de tarea, cliente, tag | Baja | Alta |
| 3 | **Facturación / presupuestos** — generar PDFs de presupuesto o factura | Alta | Media |
| 4 | **Notificaciones in-app** — deadlines próximas, recordatorios | Media | Media |
| 5 | **Estadísticas / reportes** — ingresos por mes, tiempo por comisión, % completado real | Media | Media |
| 6 | **Vista de calendario** — ver comisiones por fecha límite | Media | Baja |
| 7 | **Integración de pagos real** — Stripe/PayPal para cobrar desde la app | Alta | Baja |
| 8 | **Chat/notas con cliente** — thread de mensajes por comisión | Alta | Baja |
| 9 | **URL router** — navegación con browser history | Baja | Media |
| 10 | **Export de datos** — exportar comisiones/portafolio como CSV o ZIP | Baja | Baja |

---

## Plan de trabajo

### Fase 1 — Bugs críticos (activo)
- [x] Timer debounce a Supabase ✅
- [x] insertPublicRequest → Supabase ✅
- [x] Dashboard métricas reales ✅

### Fase 2 — Deuda técnica
- [ ] savePortfolio → upsert atómico
- [ ] GuidePage → Supabase
- [ ] task_fields cleanup (remover tareas eliminadas del caché)
- [ ] Lightbox stale closure fix

### Fase 3 — Features básicas faltantes
- [ ] Buscador global (Ctrl-K)
- [ ] Dashboard stats reales (ingresos, tiempo)
- [ ] Router (React Router v6)
- [ ] Notificaciones de deadline

### Fase 4 — Features avanzadas
- [ ] Base de datos de clientes
- [ ] Facturación PDF
- [ ] Vista calendario
- [ ] Páginas sidebar pendientes (Integraciones, etc.)
