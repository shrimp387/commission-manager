import React from 'react'

function MetricCard({ label, value, icon, color, loading, sub }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-row">
        <span className="metric-value">{loading ? '—' : value}</span>
        <span className="metric-icon" style={{ color }} aria-hidden="true">{icon}</span>
      </div>
      {sub && !loading && (
        <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{sub}</p>
      )}
    </div>
  )
}

/**
 * Calcula el avance promedio real basándose en las etapas de las tareas activas.
 * Etapas: new(0%) sketch(20%) lineart(40%) base(60%) shade(80%) review(90%) delivered(100%)
 */
const STAGE_PROGRESS = {
  new: 0, sketch: 20, lineart: 40, base: 60, shade: 80, review: 90, delivered: 100,
}

function calcAvgProgress(activeTasks, getFields) {
  if (!activeTasks.length) return 0
  const total = activeTasks.reduce((sum, t) => {
    const fields = getFields?.(t.id)
    const stage = fields?.stage ?? 'new'
    const manual = fields?.progress
    const pct = typeof manual === 'number' && manual > 0
      ? manual
      : (STAGE_PROGRESS[stage] ?? 0)
    return sum + pct
  }, 0)
  return Math.round(total / activeTasks.length)
}

/**
 * Tareas que necesitan atención hoy:
 * - Tienen deadline hoy o ya vencida, o
 * - Tienen prioridad "urgent"
 */
function calcUrgentToday(activeTasks, getFields) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return activeTasks.filter(t => {
    const fields = getFields?.(t.id)
    if (fields?.priority === 'urgent') return true
    if (fields?.deadline) {
      const d = new Date(fields.deadline)
      d.setHours(0, 0, 0, 0)
      if (d <= today) return true
    }
    return false
  }).length
}

export default function Dashboard({ active, inReview, urgent, loading, activeTasks, getFields }) {
  const avgProgress = calcAvgProgress(activeTasks ?? [], getFields)
  const urgentToday = calcUrgentToday(activeTasks ?? [], getFields)

  // Fallback: if getFields not provided, use the passed urgent value
  const urgentDisplay = getFields ? urgentToday : urgent

  return (
    <div className="dashboard">
      <MetricCard
        label="COMISIONES ACTIVAS"
        value={active}
        icon="⏱"
        color="#EC4899"
        loading={loading}
      />
      <MetricCard
        label="AVANCE PROMEDIO"
        value={`${avgProgress}%`}
        icon="✓"
        color="#22C55E"
        loading={loading}
        sub={active > 0 ? `${active} comisión${active !== 1 ? 'es' : ''}` : null}
      />
      <MetricCard
        label="EN REVISIÓN"
        value={inReview}
        icon="↗"
        color="#F97316"
        loading={loading}
      />
      <MetricCard
        label="ATENCIÓN HOY"
        value={urgentDisplay}
        icon="⚠"
        color="#EF4444"
        loading={loading}
        sub={urgentDisplay > 0 ? 'urgentes o vencidas' : null}
      />
    </div>
  )
}
