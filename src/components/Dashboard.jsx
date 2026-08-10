import React from 'react'

function MetricCard({ label, value, icon, color, loading }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-row">
        <span className="metric-value">{loading ? '—' : value}</span>
        <span className="metric-icon" style={{ color }} aria-hidden="true">{icon}</span>
      </div>
    </div>
  )
}

export default function Dashboard({ active, inReview, urgent, loading }) {
  const avgProgress = active > 0 ? Math.round((active / Math.max(active, 1)) * 30) : 0

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
        value="30%"
        icon="✓"
        color="#22C55E"
        loading={loading}
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
        value={urgent}
        icon="⚠"
        color="#EF4444"
        loading={loading}
      />
    </div>
  )
}
