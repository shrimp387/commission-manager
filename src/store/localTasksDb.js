/**
 * Base de datos local de tareas — usa localStorage como persistencia.
 * Taskade se usa solo para carga inicial y sincronización en segundo plano.
 *
 * Estructura en localStorage bajo 'local_tasks':
 * {
 *   tasks: Task[],        // lista completa de tareas
 *   lastSync: number,     // timestamp de última sync con Taskade
 *   localOnly: string[],  // IDs de tareas creadas localmente (no tienen ID de Taskade aún)
 *   deleted: string[],    // IDs borrados localmente (para sync)
 * }
 */

const LS_KEY = 'local_tasks'

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { tasks: [], lastSync: 0, localOnly: [], deleted: [] }
    return JSON.parse(raw)
  } catch {
    return { tasks: [], lastSync: 0, localOnly: [], deleted: [] }
  }
}

function save(db) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db))
  } catch (e) {
    console.warn('localTasksDb: localStorage full', e)
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getAllTasks() {
  return load().tasks
}

export function saveSyncedTasks(tasks) {
  const db = load()
  // Respeta las tareas borradas localmente — no las restaura desde Taskade
  const deletedSet = new Set(db.deleted)
  const filteredTasks = tasks.filter(t => !deletedSet.has(t.id))
  // Mantiene tareas local-only
  const localOnlyTasks = db.tasks.filter(t => db.localOnly.includes(t.id))
  db.tasks = [...filteredTasks, ...localOnlyTasks]
  db.lastSync = Date.now()
  save(db)
}

export function addLocalTask(task) {
  const db = load()
  db.tasks = [task, ...db.tasks]
  db.localOnly = [...db.localOnly, task.id]
  save(db)
}

export function removeLocalTask(taskId) {
  const db = load()
  db.tasks = db.tasks.filter(t => t.id !== taskId)
  db.localOnly = db.localOnly.filter(id => id !== taskId)
  db.deleted = [...db.deleted, taskId]
  save(db)
}

export function updateLocalTask(taskId, updates) {
  const db = load()
  db.tasks = db.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
  save(db)
}

export function isLocalOnly(taskId) {
  return load().localOnly.includes(taskId)
}

export function promoteLocalTask(localId, realId) {
  // When Taskade confirms a local-only task, replace the temp ID with the real one
  const db = load()
  db.tasks = db.tasks.map(t => t.id === localId ? { ...t, id: realId } : t)
  db.localOnly = db.localOnly.filter(id => id !== localId)
  save(db)
}

export function getLastSync() {
  return load().lastSync
}

export function clearDeleted() {
  const db = load()
  db.deleted = []
  save(db)
}
