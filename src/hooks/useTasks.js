import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchTasks, completeTask, uncompleteTask, createTask, deleteTask, updateTask } from '../api/taskade.js'
import { SECTION_IDS } from '../config.js'
import { setTaskField, getTaskFields } from '../store/taskStore.js'
import {
  getAllTasks,
  saveSyncedTasks,
  addLocalTask,
  removeLocalTask,
  updateLocalTask,
  promoteLocalTask,
  isLocalOnly,
} from '../store/localTasksDb.js'
import { saveTaskStructure, deleteTaskStructure, getAllTaskStructures } from '../lib/db.js'

/**
 * Hook local-first para gestionar comisiones.
 *
 * Estrategia:
 * 1. Al montar: carga inmediatamente desde localStorage (sin espera)
 * 2. En segundo plano: sincroniza con Taskade y actualiza el estado
 * 3. Crear/Borrar/Renombrar: primero actualiza local, luego intenta API silenciosamente
 */
export function useTasks() {
  const [rawTasks, setRawTasks] = useState(() => {
    // Carga instantánea desde localStorage
    const saved = getAllTasks()
    return saved.length > 0 ? saved : []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle') // 'idle' | 'syncing' | 'synced' | 'offline'
  const syncRef = useRef(false)

  // ── Aplica overrides locales a las tareas ──────────────────────────────────
  function applyLocalOverrides(tasks) {
    return tasks.map(t => {
      const fields = getTaskFields(t.id)
      let result = { ...t }
      if (fields?.completedState !== undefined) result.completed = fields.completedState
      if (fields?.sectionOverride) result.parentId = fields.sectionOverride
      return result
    })
  }

  // ── Sync con Taskade en segundo plano ──────────────────────────────────────
  const syncWithTaskade = useCallback(async () => {
    if (syncRef.current) return
    syncRef.current = true
    setSyncStatus('syncing')
    try {
      const tasks = await fetchTasks()
      saveSyncedTasks(tasks)
      // After saving, read back from DB (includes local-only tasks preserved)
      const allLocal = getAllTasks()
      const merged = applyLocalOverrides(allLocal)
      setRawTasks(merged)
      setSyncStatus('synced')
    } catch (err) {
      // Taskade unavailable — fall back to Supabase task structures
      console.warn('Taskade sync failed, trying Supabase:', err.message)
      try {
        const supabaseTasks = await getAllTaskStructures()
        if (supabaseTasks.length > 0) {
          // Merge with local-only tasks (created offline)
          const localDb = getAllTasks()
          const localOnlyTasks = localDb.filter(t => t.id?.startsWith('local_'))
          const allTasks = [...supabaseTasks, ...localOnlyTasks]
          // Sync to local store so subsequent reads are fast
          saveSyncedTasks(allTasks)
          const merged = applyLocalOverrides(allTasks)
          setRawTasks(merged)
          setSyncStatus('synced') // Supabase = online, just no Taskade
          return
        }
      } catch (sbErr) {
        console.warn('Supabase fallback also failed:', sbErr.message)
      }
      setSyncStatus('offline')
    } finally {
      syncRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Si ya tenemos datos locales, no mostrar loading
    const saved = getAllTasks()
    if (saved.length > 0) {
      setRawTasks(applyLocalOverrides(saved))
      setLoading(false)
    }
    // Sincronizar en segundo plano siempre
    syncWithTaskade()
  }, [syncWithTaskade])

  const sections = buildSections(rawTasks)

  // ── Toggle completado ──────────────────────────────────────────────────────
  const toggleTask = useCallback(async (taskId, completed) => {
    const newCompleted = !completed
    setRawTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t))
    updateLocalTask(taskId, { completed: newCompleted })
    setTaskField(taskId, 'completedState', newCompleted)
    // Sync silenciosa
    try {
      if (completed) await uncompleteTask(taskId)
      else await completeTask(taskId)
    } catch (err) {
      console.warn('toggleTask API failed (local state preserved):', err.message)
    }
  }, [])

  // ── Agregar comisión — LOCAL FIRST ─────────────────────────────────────────
  const addCommission = useCallback(async (text, sectionId, extraFields = {}) => {
    const tempId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const newTask = {
      id: tempId,
      text,
      parentId: sectionId,
      completed: false,
      children: [],
    }
    addLocalTask(newTask)
    setRawTasks(prev => [newTask, ...prev])

    // Save structure to Supabase immediately (so it persists without Taskade)
    await saveTaskStructure({ id: tempId, text, parentId: sectionId, localOnly: true })

    // Save extra fields (client, priority, stage, deadline, assignee, notes, attachments)
    if (Object.keys(extraFields).length > 0) {
      const { client = '', priority = 'ok', stage = 'new', deadline = '',
              assignee = '', notes = '', images = [] } = extraFields
      const attachments = images.map((img, i) => ({
        id: `img_${i}_${Date.now()}`,
        name: img.name,
        url: img.url,
        type: 'image/jpeg',
      }))
      setTaskField(tempId, 'client', client)
      setTaskField(tempId, 'priority', priority)
      setTaskField(tempId, 'stage', stage)
      if (deadline) setTaskField(tempId, 'deadline', deadline)
      if (assignee) setTaskField(tempId, 'assignee', assignee)
      if (notes) setTaskField(tempId, 'note', notes)
      if (attachments.length > 0) setTaskField(tempId, 'attachments', attachments)
    }

    // Sync with Taskade silently
    try {
      const result = await createTask(text, sectionId)
      const realId = result?.item?.id || result?.id
      if (realId && realId !== tempId) {
        promoteLocalTask(tempId, realId)
        // Update Supabase with the real Taskade ID
        await saveTaskStructure({ id: realId, text, parentId: sectionId, localOnly: false })
        setRawTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: realId } : t))
      }
    } catch (err) {
      console.warn('createTask API failed (task saved locally + Supabase):', err.message)
    }
  }, [])

  // ── Eliminar tarea — LOCAL FIRST ───────────────────────────────────────────
  const removeTask = useCallback(async (taskId) => {
    removeLocalTask(taskId)
    setRawTasks(prev => prev.filter(t => t.id !== taskId))
    setError(null)
    // Mark deleted in Supabase
    deleteTaskStructure(taskId)
    if (isLocalOnly(taskId) || taskId.startsWith('local_')) return
    try { await deleteTask(taskId) }
    catch (err) { console.warn('deleteTask API failed (deleted locally):', err.message) }
  }, [])

  // ── Renombrar tarea — LOCAL FIRST ──────────────────────────────────────────
  const renameTask = useCallback(async (taskId, newText) => {
    setRawTasks(prev => prev.map(t => t.id === taskId ? { ...t, text: newText } : t))
    updateLocalTask(taskId, { text: newText })
    // Update text in Supabase
    saveTaskStructure({ id: taskId, text: newText })
    try { await updateTask(taskId, { text: newText }) }
    catch (err) { console.warn('renameTask API failed (local rename preserved):', err.message) }
  }, [])

  // ── Mover tarea — LOCAL ONLY ───────────────────────────────────────────────
  const moveTask = useCallback((taskId, fromSectionId, toSectionId) => {
    setRawTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, parentId: toSectionId } : t
    ))
    updateLocalTask(taskId, { parentId: toSectionId })
    setTaskField(taskId, 'sectionOverride', toSectionId)
    // Persist section move in Supabase
    saveTaskStructure({ id: taskId, parentId: toSectionId })
  }, [])

  // ── Reload manual ──────────────────────────────────────────────────────────
  const reload = useCallback(() => {
    setSyncStatus('idle')
    syncRef.current = false
    syncWithTaskade()
  }, [syncWithTaskade])

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
    { id: SECTION_IDS.BACKLOG, label: '📋 Backlog y Proyectos', color: '#6B7280' },
    { id: SECTION_IDS.NEW, label: '🎨 Comisiones Nuevas', color: '#60A5FA' },
    { id: SECTION_IDS.IN_PROGRESS, label: '🖌️ En Proceso', color: '#F59E0B' },
    { id: SECTION_IDS.IN_REVIEW, label: '👀 En Revisión', color: '#FACC15' },
  ]

  const customDefs = getCustomSectionsFromStorage()

  const allDefs = [...fixedDefs, ...customDefs]

  return allDefs.map(def => ({
    ...def,
    // For fixed sections: use children from taskMap (Taskade hierarchy)
    // For custom sections: find tasks whose parentId matches this section id
    items: taskMap[def.id]?.children ?? tasks.filter(t => t.parentId === def.id),
  }))
}
