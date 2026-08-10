/**
 * Taskade REST API v1 client
 * Docs: https://www.taskade.com/learn/connect/public-api
 */
import { TASKADE_CONFIG } from '../config.js'

const { API_KEY, BASE_URL, PROJECT_ID } = TASKADE_CONFIG

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { headers, ...options })

  // Handle empty responses (e.g. DELETE 204)
  const text = await res.text()
  let data = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = {} }
  }

  // Taskade API returns { ok: true, ... } on success
  // Some endpoints return 2xx with ok:true, others just 2xx with no ok field
  if (!res.ok) {
    throw new Error(data.statusMessage || data.message || `HTTP ${res.status}`)
  }
  // Only treat as error if ok is explicitly false
  if (data.ok === false) {
    throw new Error(data.statusMessage || data.message || `API error`)
  }
  return data
}

/** Obtiene todas las tareas del proyecto */
export async function fetchTasks() {
  const data = await request(`/projects/${PROJECT_ID}/tasks`)
  return data.items ?? []
}

/** Obtiene los campos personalizados del proyecto */
export async function fetchFields() {
  const data = await request(`/projects/${PROJECT_ID}/fields`)
  return data.items ?? []
}

/** Obtiene los bloques de contenido del proyecto */
export async function fetchBlocks() {
  const data = await request(`/projects/${PROJECT_ID}/blocks`)
  return data.items ?? []
}

/** Marca una tarea como completada */
export async function completeTask(taskId) {
  return request(`/tasks/${taskId}/complete`, { method: 'PUT' })
}

/** Marca una tarea como incompleta */
export async function uncompleteTask(taskId) {
  return request(`/tasks/${taskId}/uncomplete`, { method: 'PUT' })
}

/** Crea una nueva tarea en el proyecto */
export async function createTask(text, parentId = null) {
  // Taskade v1 expects tasks as an array with content field
  const body = {
    tasks: [{ content: text }]
  }
  if (parentId) body.tasks[0].parentId = parentId
  return request(`/projects/${PROJECT_ID}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Actualiza una tarea */
export async function updateTask(taskId, data) {
  return request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** Elimina una tarea */
export async function deleteTask(taskId) {
  return request(`/tasks/${taskId}`, { method: 'DELETE' })
}
