/**
 * Store global de campos de tareas.
 * Persiste en localStorage (fallback) y Supabase (cuando disponible).
 */
import { useState, useCallback, useEffect } from 'react'
import { setTaskFieldDb } from '../lib/db.js'

const LS_KEY = 'task_fields'

function loadAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') }
  catch { return {} }
}

function saveAll(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) }
  catch (e) { console.warn('localStorage full, clearing old data', e) }
}

// Derive initial fields from task text/section
export function inferFields(task, sectionId) {
  const clientMatch = task.text.match(/[-–]\s*(.+)$/)
  const client = clientMatch ? clientMatch[1].trim() : ''
  let priority = 'ok'
  let stage = 'new'
  if (sectionId?.includes('b5f9')) { priority = 'urgent'; stage = 'review' }
  if (task.children?.length > 0) {
    const done = task.children.filter(c => c.completed)
    const last = done[done.length - 1]
    if (last) {
      const t = last.text.toLowerCase()
      if (t.includes('sketch') || t.includes('boceto')) stage = 'sketch'
      else if (t.includes('lineart') || t.includes('línea')) stage = 'lineart'
      else if (t.includes('color base')) stage = 'base'
      else if (t.includes('sombr')) stage = 'shade'
    }
  }
  return {
    priority, stage, client,
    progress: 0, deadline: '', nextStep: '',
    assignee: '', comments: [], attachments: [],
    reactions: {}, timer: 0, timerRunning: false,
    pinned: false, note: '',
  }
}

// Global in-memory cache (shared across hook instances)
let _cache = loadAll()
const _listeners = new Set()
let _saveStatus = 'idle' // 'saving' | 'saved' | 'idle'
const _statusListeners = new Set()

function notifyData() {
  _listeners.forEach(fn => fn({ ..._cache }))
}

function notifyStatus(s) {
  _saveStatus = s
  _statusListeners.forEach(fn => fn(s))
}

export function setTaskField(taskId, field, value) {
  if (!_cache[taskId]) _cache[taskId] = {}
  _cache[taskId] = { ..._cache[taskId], [field]: value }
  notifyStatus('saving')
  saveAll(_cache)
  notifyData()
  // Also sync to Supabase (fire and forget — localStorage is the source of truth locally)
  setTaskFieldDb(taskId, field, value).catch(() => {})
  setTimeout(() => notifyStatus('saved'), 300)
  setTimeout(() => notifyStatus('idle'), 2000)
}

export function getTaskFields(taskId) {
  return _cache[taskId] ?? null
}

export function initTaskFields(taskId, defaults) {
  if (!_cache[taskId]) {
    _cache[taskId] = { ...defaults }
    saveAll(_cache)
  }
}

// React hook to subscribe to store
export function useTaskStore() {
  const [data, setData] = useState({ ..._cache })
  const [saveStatus, setSaveStatus] = useState(_saveStatus)

  useEffect(() => {
    const dataHandler = (next) => setData(next)
    const statusHandler = (s) => setSaveStatus(s)
    _listeners.add(dataHandler)
    _statusListeners.add(statusHandler)
    return () => {
      _listeners.delete(dataHandler)
      _statusListeners.delete(statusHandler)
    }
  }, [])

  const updateField = useCallback((taskId, field, value) => {
    setTaskField(taskId, field, value)
  }, [])

  const getFields = useCallback((taskId) => {
    return data[taskId] ?? {}
  }, [data])

  const ensureTask = useCallback((taskId, task, sectionId) => {
    if (!_cache[taskId]) {
      initTaskFields(taskId, inferFields(task, sectionId))
      setData({ ..._cache })
    }
  }, [])

  return { getFields, updateField, ensureTask, data, saveStatus }
}
