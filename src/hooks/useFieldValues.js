import { useState, useCallback } from 'react'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

/**
 * Gestiona los valores de campos personalizados (Prioridad, Etapa, Cliente)
 * en memoria local — ya que la API v1 no expone field-values por tarea directamente.
 * Los valores iniciales se infieren del nombre/sección de cada tarea.
 */

function inferFieldsFromTask(task, sectionId) {
  // Inferir cliente del nombre (texto después del guión)
  const clientMatch = task.text.match(/[-–]\s*(.+)$/)
  const client = clientMatch ? clientMatch[1].trim() : ''

  // Inferir prioridad por sección
  let priority = 'ok'
  if (sectionId?.includes('b5f9')) priority = 'urgent'  // En Revisión

  // Inferir etapa por subtareas completadas
  let stage = 'new'
  if (task.children?.length > 0) {
    const done = task.children.filter(c => c.completed)
    const last = done[done.length - 1]
    if (last) {
      const txt = last.text.toLowerCase()
      if (txt.includes('sketch') || txt.includes('boceto')) stage = 'sketch'
      else if (txt.includes('lineart') || txt.includes('línea')) stage = 'lineart'
      else if (txt.includes('color base') || txt.includes('base')) stage = 'base'
      else if (txt.includes('sombr')) stage = 'shade'
    }
    const pending = task.children.find(c => !c.completed)
    if (pending) {
      const txt = pending.text.toLowerCase()
      if (txt.includes('sketch')) stage = 'sketch'
      else if (txt.includes('lineart')) stage = 'lineart'
      else if (txt.includes('color base')) stage = 'base'
      else if (txt.includes('sombr')) stage = 'shade'
      else if (txt.includes('revis')) stage = 'review'
    }
  }
  if (sectionId?.includes('b5f9')) stage = 'review'

  return { priority, stage, client, progress: 0 }
}

export function useFieldValues(sections) {
  const [values, setValues] = useState(() => {
    const map = {}
    sections.forEach(section => {
      section.items.forEach(task => {
        map[task.id] = inferFieldsFromTask(task, section.id)
      })
    })
    return map
  })

  // Recalcular cuando cambian las secciones
  const initForTask = useCallback((taskId, task, sectionId) => {
    setValues(prev => {
      if (prev[taskId]) return prev
      return { ...prev, [taskId]: inferFieldsFromTask(task, sectionId) }
    })
  }, [])

  const updateField = useCallback((taskId, field, value) => {
    setValues(prev => ({
      ...prev,
      [taskId]: { ...(prev[taskId] ?? {}), [field]: value }
    }))
  }, [])

  const getFields = useCallback((taskId) => {
    return values[taskId] ?? { priority: 'ok', stage: 'new', client: '', progress: 0 }
  }, [values])

  return { getFields, updateField, initForTask }
}
