/**
 * useTasks — hook de tareas 100% en Supabase.
 *
 * Ya no depende de Taskade. Las tareas se guardan en la tabla `tasks`
 * de Supabase con su texto, sección (parentId) y campos adicionales.
 *
 * Al montar: carga desde localStorage (instantáneo) y luego sincroniza
 * con Supabase en segundo plano.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { SECTION_IDS } from '../config.js'
import { setTaskField, getTaskFields } from '../store/taskStore.js'
import {
  getAllTasks as getAllLocalTasks,
  addLocalTask,
  removeLocalTask,
  updateLocalTask,
  isLocalOnly,
} from '../store/localTasksDb.js'
import {
  saveTaskStructure,
  deleteTaskStructure,
  getAllTaskStructures,
} from '../lib/db.js'

export function useTasks() {
  const [rawTasks, setRawTasks] = useState(() => {
    const saved = getAllLocalTasks()
    return saved.length > 0 ? applyLocalOverrides(saved) : []
  })
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [error, setError] = useState(null)
  const syncRef = useRef(false)

  // ── Load from Supabase ─────────────────────────────────────────────────────
  const syncWithSupabase = useCallback(async () => {
    if (syncRef.current) return
    syncRef.current = true
    setSyncStatus('syncing')

    try {
      const supabaseTasks = await getAllTaskStructures()

      if (supabaseTasks.length > 0) {
        // Merge with local-only tasks (created while offline)
        const localTasks = getAllLocalTasks()
        const localOnlyIds = new Set(
          localTasks.filter(t => t.id?.startsWith('local_')).map(t => t.id)
        )
        const supabaseIds = new Set(supabaseTasks.map(t => t.id))

        // Local-only tasks not yet in Supabase
        const localOnlyTasks = localTasks.filter(
          t => localOnlyIds.has(t.id) && !supabaseIds.has(t.id)
        )

        const merged = applyLocalOverrides([...supabaseTasks, ...localOnlyTasks])

        // Update localStorage cache
        try {
          const db = { tasks: merged, lastSync: Date.now(), localOnly: [...localOnlyIds], deleted: [] }
          localStorage.setItem('local_tasks', JSON.stringify(db))
        } catch {}

        setRawTasks(merged)
        setSyncStatus('synced')
      } else {
        // Supabase empty — check if we have local tasks to migrate
        const localTasks = getAllLocalTasks()
        if (localTasks.length > 0) {
          // Migrate all local tasks to Supabase
          await Promise.all(localTasks.map(t =>
            saveTaskStructure({ id: t.id, text: t.text, parentId: t.parentId, localOnly: t.id?.startsWith('local_') })
          ))
          setRawTasks(applyLocalOverrides(localTasks))
        }
        setSyncStatus('synced')
      }
    } catch (err) {
      console.warn('[useTasks] Supabase sync failed:', err.message)
      // Use whatever is in localStorage
      const local = getAllLocalTasks()
      setRawTasks(applyLocalOverrides(local))
      setSyncStatus('offline')
    } finally {
      syncRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Show local data immediately while loading from Supabase
    const saved = getAllLocalTasks()
    if (saved.length > 0) {
      setRawTasks(applyLocalOverrides(saved))
      setLoading(false)
    }
    syncWithSupabase()
  }, [syncWithSupabase])

  const sections = buildSections(rawTasks)

  // ── Toggle completado ────────────────────────────────────────────────────
  const toggleTask = useCallback(async (taskId, completed) => {
    const newCompleted = !completed
    setRawTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t))
    updateLocalTask(taskId, { completed: newCompleted })
    setTaskField(taskId, 'completedState', newCompleted)
  }, [])

  // ── Agregar comisión ────────────────────────────────────────────────────
  const addCommission = useCallback(async (text, sectionId, extraFields = {}) => {
    const tempId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const newTask = { id: tempId, text, parentId: sectionId, completed: false, children: [] }

    addLocalTask(newTask)
    setRawTasks(prev => [newTask, ...prev])

    // Save structure to Supabase
    await saveTaskStructure({ id: tempId, text, parentId: sectionId, localOnly: true })

    // Save extra fields (priority, stage, client, etc.)
    const { client = '', priority = 'ok', stage = 'new', deadline = '',
            assignee = '', notes = '', images = [] } = extraFields

    if (client)    setTaskField(tempId, 'client', client)
    if (priority)  setTaskField(tempId, 'priority', priority)
    if (stage)     setTaskField(tempId, 'stage', stage)
    if (deadline)  setTaskField(tempId, 'deadline', deadline)
    if (assignee)  setTaskField(tempId, 'assignee', assignee)
    if (notes)     setTaskField(tempId, 'note', notes)

    if (images.length > 0) {
      const attachments = images.map((img, i) => ({
        id: `img_${i}_${Date.now()}`,
        name: img.name,
        url: img.url,
        type: 'image/jpeg',
      }))
      setTaskField(tempId, 'attachments', attachments)
    }
  }, [])

  // ── Eliminar tarea ────────────────────────────────────────────────────
  const removeTask = useCallback(async (taskId) => {
    removeLocalTask(taskId)
    setRawTasks(prev => prev.filter(t => t.id !== taskId))
    setError(null)
    deleteTaskStructure(taskId)
  }, [])

  // ── Renombrar tarea ────────────────────────────────────────────────────
  const renameTask = useCallback(async (taskId, newText) => {
    setRawTasks(prev => prev.map(t => t.id === taskId ? { ...t, text: newText } : t))
    updateLocalTask(taskId, { text: newText })
    saveTaskStructure({ id: taskId, text: newText })
  }, [])

  // ── Mover tarea entre secciones ────────────────────────────────────────
  const moveTask = useCallback((taskId, _fromSectionId, toSectionId) => {
    setRawTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, parentId: toSectionId } : t
    ))
    updateLocalTask(taskId, { parentId: toSectionId })
    setTaskField(taskId, 'sectionOverride', toSectionId)
    saveTaskStructure({ id: taskId, parentId: toSectionId })
  }, [])

  // ── Reload manual ──────────────────────────────────────────────────────
  const reload = useCallback(() => {
    setSyncStatus('idle')
    syncRef.current = false
    syncWithSupabase()
  }, [syncWithSupabase])

  return {
    sections,
    rawTasks,
    loading,
    error,
    syncStatus,
    reload,
    toggleTask,
    addCommission,
    removeTask,
    renameTask,
    moveTask,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function applyLocalOverrides(tasks) {
  return tasks.map(t => {
    const fields = getTaskFields(t.id)
    let result = { ...t }
    if (fields?.completedState !== undefined) result.completed = fields.completedState
    if (fields?.sectionOverride) result.parentId = fields.sectionOverride
    return result
  })
}

function getCustomSectionsFromStorage() {
  try { return JSON.parse(localStorage.getItem('kanban_custom_sections') || '[]') }
  catch { return [] }
}

function buildSections(tasks) {
  const taskMap = {}
  tasks.forEach(t => { taskMap[t.id] = { ...t, children: [] } })
  tasks.forEach(t => {
    if (t.parentId && taskMap[t.parentId]) {
      taskMap[t.parentId].children.push(taskMap[t.id])
    }
  })

  const fixedDefs = [
    { id: SECTION_IDS.BACKLOG,      label: '📋 Backlog y Proyectos', color: '#6B7280' },
    { id: SECTION_IDS.NEW,          label: '🎨 Comisiones Nuevas',   color: '#60A5FA' },
    { id: SECTION_IDS.IN_PROGRESS,  label: '🖌️ En Proceso',         color: '#F59E0B' },
    { id: SECTION_IDS.IN_REVIEW,    label: '👀 En Revisión',         color: '#FACC15' },
  ]

  const customDefs = getCustomSectionsFromStorage()
  const allDefs = [...fixedDefs, ...customDefs]

  return allDefs.map(def => ({
    ...def,
    items: taskMap[def.id]?.children ?? tasks.filter(t => t.parentId === def.id),
  }))
}
