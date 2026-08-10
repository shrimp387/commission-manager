/**
 * Base de datos local de comisiones archivadas.
 * Persiste en localStorage bajo 'archived_commissions'.
 *
 * Un registro archivado guarda:
 * - id, text (nombre), client, stage, priority, deadline, assignee
 * - archivedAt (timestamp), completedAt (timestamp)
 * - tags[], notes, thumbnailUrl (primera imagen si existe)
 */

const LS_KEY = 'archived_commissions'

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}

function save(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) }
  catch (e) { console.warn('archiveDb: localStorage full', e) }
}

export function getArchived() {
  return load()
}

export function archiveTask(task, fields = {}) {
  const existing = load()
  // Avoid duplicates
  if (existing.some(a => a.id === task.id)) return

  const attachments = fields.attachments || []
  const thumbnailUrl = attachments.find(a => a.type?.startsWith('image/'))?.url || null

  const record = {
    id: task.id,
    text: task.text,
    client: fields.client || '',
    stage: fields.stage || 'delivered',
    priority: fields.priority || 'ok',
    deadline: fields.deadline || '',
    assignee: fields.assignee || '',
    notes: fields.note || '',
    tags: fields.tags || [],
    thumbnailUrl,
    timer: fields.timer || 0,
    archivedAt: Date.now(),
    completedAt: fields.completedAt || Date.now(),
    checklist: fields.checklist || [],
    comments: (fields.comments || []).length,
  }

  save([record, ...existing])
  return record
}

export function removeArchived(id) {
  save(load().filter(a => a.id !== id))
}

export function updateArchivedTags(id, tags) {
  save(load().map(a => a.id === id ? { ...a, tags } : a))
}

export function clearArchived() {
  save([])
}
