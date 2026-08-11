/**
 * DeadlineNotifier — muestra notificaciones flotantes para deadlines próximas.
 *
 * Detecta tareas activas con:
 *  - Deadline hoy
 *  - Deadline vencida (pasó sin completarse)
 *  - Deadline mañana (aviso anticipado)
 *
 * Se monta una sola vez en App.jsx y corre en segundo plano.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { getAllTasks as getAllLocalTasks } from '../store/localTasksDb.js'
import { getTaskFields } from '../store/taskStore.js'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const deadline = new Date(dateStr)
  deadline.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((deadline - today) / 86400000)
}

function getDeadlineAlerts(tasks) {
  const alerts = []
  for (const task of tasks) {
    const fields = getTaskFields(task.id)
    if (!fields?.deadline || fields?.completedState) continue
    const days = daysUntil(fields.deadline)
    if (days === null) continue
    if (days < 0) {
      alerts.push({ id: task.id, text: task.text, days, type: 'overdue', priority: fields.priority })
    } else if (days === 0) {
      alerts.push({ id: task.id, text: task.text, days, type: 'today', priority: fields.priority })
    } else if (days === 1) {
      alerts.push({ id: task.id, text: task.text, days, type: 'tomorrow', priority: fields.priority })
    }
  }
  return alerts.sort((a, b) => a.days - b.days)
}

const DISMISSED_KEY = 'deadline_dismissed'

function getDismissed() {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]')) }
  catch { return new Set() }
}

function dismiss(taskId) {
  const set = getDismissed()
  set.add(taskId)
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
}

export default function DeadlineNotifier() {
  const [alerts, setAlerts] = useState([])
  const [visible, setVisible] = useState(true)

  const checkDeadlines = useCallback(() => {
    const tasks = getAllLocalTasks()
    const dismissed = getDismissed()
    const found = getDeadlineAlerts(tasks).filter(a => !dismissed.has(a.id))
    setAlerts(found)
  }, [])

  useEffect(() => {
    checkDeadlines()
    // Re-check every 5 minutes
    const interval = setInterval(checkDeadlines, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkDeadlines])

  if (!visible || alerts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9998, display: 'flex', flexDirection: 'column', gap: '0.5rem',
        alignItems: 'center', pointerEvents: 'none',
        maxWidth: 'min(480px, 90vw)',
      }}
    >
      {alerts.slice(0, 3).map(alert => (
        <div
          key={alert.id}
          style={{
            pointerEvents: 'all',
            background: alert.type === 'overdue' ? 'rgba(239,68,68,0.12)' : alert.type === 'today' ? 'rgba(245,158,11,0.12)' : 'rgba(96,165,250,0.10)',
            border: `1px solid ${alert.type === 'overdue' ? 'rgba(239,68,68,0.4)' : alert.type === 'today' ? 'rgba(245,158,11,0.4)' : 'rgba(96,165,250,0.3)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.55rem 0.875rem',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            fontSize: '0.78rem', color: 'var(--text)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
            minWidth: 280,
          }}
        >
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>
            {alert.type === 'overdue' ? '🔴' : alert.type === 'today' ? '🟡' : '🔵'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.text}
            </p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {alert.type === 'overdue'
                ? `Vencida hace ${Math.abs(alert.days)} día${Math.abs(alert.days) !== 1 ? 's' : ''}`
                : alert.type === 'today'
                ? 'Deadline hoy'
                : 'Deadline mañana'}
            </p>
          </div>
          <button
            onClick={() => { dismiss(alert.id); checkDeadlines() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '0 0.2rem', flexShrink: 0 }}
            aria-label="Descartar"
          >×</button>
        </div>
      ))}
      {alerts.length > 3 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', pointerEvents: 'all' }}>
          +{alerts.length - 3} más con deadline próxima
        </div>
      )}
    </div>
  )
}
