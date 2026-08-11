/**
 * StatsPage — Mapa DNA / Estadísticas del estudio.
 * Métricas reales de comisiones, ingresos, tiempo y etapas.
 */
import React, { useMemo } from 'react'
import { getAllTasks as getAllLocalTasks } from '../store/localTasksDb.js'
import { getTaskFields } from '../store/taskStore.js'
import { getArchived } from '../store/archiveDb.js'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

function StatBox({ label, value, icon, color = 'var(--green)', sub }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '2rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{sub}</p>}
        </div>
        <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>{icon}</span>
      </div>
    </div>
  )
}

function BarChart({ data, label, colorKey = 'color' }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {data.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: 110, flexShrink: 0, textAlign: 'right' }}>{d.name}</span>
            <div style={{ flex: 1, height: 20, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${(d.value / max) * 100}%`,
                background: d[colorKey] || 'var(--green)',
                transition: 'width 0.4s',
                minWidth: d.value > 0 ? 4 : 0,
              }} />
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: 24, flexShrink: 0, textAlign: 'right' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatsPage() {
  const stats = useMemo(() => {
    const active = getAllLocalTasks()
    const archived = getArchived()

    // Active stats
    const activeCount = active.length
    let urgentCount = 0, totalTimer = 0, totalProgress = 0

    const stageCounts = Object.fromEntries(Object.keys(STAGE_OPTIONS).map(k => [k, 0]))
    const priorityCounts = Object.fromEntries(Object.keys(PRIORITY_OPTIONS).map(k => [k, 0]))

    active.forEach(t => {
      const f = getTaskFields(t.id)
      if (!f) return
      if (f.priority === 'urgent') urgentCount++
      totalTimer += f.timer || 0
      if (f.stage && stageCounts[f.stage] !== undefined) stageCounts[f.stage]++
      if (f.priority && priorityCounts[f.priority] !== undefined) priorityCounts[f.priority]++
      if (typeof f.progress === 'number') totalProgress += f.progress
    })

    // Archived stats
    const archivedCount = archived.length
    const archivedTimer = archived.reduce((s, a) => s + (a.timer || 0), 0)

    // Income from archived (if they have payment data stored)
    // We don't have payment stored in archived, so we skip for now

    const stageData = Object.entries(STAGE_OPTIONS).map(([id, s]) => ({
      id, name: s.name, value: stageCounts[id] || 0, color: s.color,
    })).filter(d => d.value > 0)

    const priorityData = Object.entries(PRIORITY_OPTIONS).map(([id, p]) => ({
      id, name: p.name, value: priorityCounts[id] || 0, color: p.color,
    })).filter(d => d.value > 0)

    const totalHours = Math.round((totalTimer + archivedTimer) / 3600)
    const activeHours = Math.round(totalTimer / 3600)
    const avgProgress = activeCount > 0 ? Math.round(totalProgress / activeCount) : 0

    return { activeCount, urgentCount, archivedCount, totalHours, activeHours, avgProgress, stageData, priorityData }
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, transparent 60%)' }} />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">🧬</div>
            <div>
              <p className="page-header-eyebrow">ANÁLISIS</p>
              <h1 className="page-header-title">Mapa DNA del Estudio</h1>
              <p className="page-header-sub">Estadísticas y métricas de tu actividad creativa.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <StatBox label="Comisiones activas" value={stats.activeCount} icon="🎨" color="var(--green)" />
          <StatBox label="Completadas (historial)" value={stats.archivedCount} icon="✅" color="#60A5FA" />
          <StatBox label="Urgentes ahora" value={stats.urgentCount} icon="🔴" color="#EF4444" />
          <StatBox label="Horas totales" value={stats.totalHours} icon="⏱" color="#F59E0B" sub={`${stats.activeHours}h en activas`} />
          <StatBox label="Avance promedio" value={`${stats.avgProgress}%`} icon="📊" color="#22C55E" />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem' }}>
            {stats.stageData.length > 0
              ? <BarChart data={stats.stageData} label="Comisiones por etapa" />
              : <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Sin datos de etapas todavía.</p>
            }
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem' }}>
            {stats.priorityData.length > 0
              ? <BarChart data={stats.priorityData} label="Comisiones por prioridad" />
              : <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Sin datos de prioridad todavía.</p>
            }
          </div>
        </div>

        {stats.activeCount === 0 && stats.archivedCount === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
            <p style={{ fontSize: '2rem' }}>🧬</p>
            <p>Aún no hay suficientes datos.</p>
            <p style={{ fontSize: '0.8rem' }}>Las estadísticas aparecerán conforme agregues comisiones.</p>
          </div>
        )}
      </div>
    </div>
  )
}
