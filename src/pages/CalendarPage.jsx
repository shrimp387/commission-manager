/**
 * CalendarPage — Vista de calendario de comisiones.
 * Muestra deadlines de comisiones activas en un calendario mensual.
 * Sin dependencias externas — implementación propia con CSS Grid.
 */
import React, { useState, useMemo } from 'react'
import { getAllTasks as getAllLocalTasks } from '../store/localTasksDb.js'
import { getTaskFields } from '../store/taskStore.js'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getCalendarDays(year, month) {
  // month is 0-indexed
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  // Day of week for first day (0=Sun → adjust to Mon-start)
  let startDow = first.getDay() // 0=Sun,1=Mon,...
  if (startDow === 0) startDow = 7
  startDow -= 1 // now 0=Mon

  const days = []
  // Fill leading empty days
  for (let i = 0; i < startDow; i++) days.push(null)
  // Fill month days
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  // Fill trailing empty days to complete last row
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function parseDeadline(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function DayCell({ date, events, isToday, onDayClick }) {
  if (!date) return <div style={{ minHeight: 80 }} />

  const hasEvents = events.length > 0
  return (
    <div
      onClick={() => hasEvents && onDayClick(date, events)}
      style={{
        minHeight: 80, borderRadius: 'var(--radius-sm)',
        border: isToday ? '1px solid var(--green)' : '1px solid var(--border)',
        background: isToday ? 'rgba(34,197,94,0.06)' : 'var(--surface)',
        padding: '6px 8px', cursor: hasEvents ? 'pointer' : 'default',
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <p style={{
        margin: 0, fontSize: '0.75rem', fontWeight: isToday ? 800 : 500,
        color: isToday ? 'var(--green)' : 'var(--text-muted)',
        marginBottom: 4,
      }}>
        {date.getDate()}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.slice(0, 3).map(ev => (
          <div
            key={ev.id}
            style={{
              fontSize: '0.62rem', borderRadius: 3, padding: '1px 4px',
              background: ev.color + '22', color: ev.color,
              border: `1px solid ${ev.color}44`,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={ev.title}
          >
            {ev.title}
          </div>
        ))}
        {events.length > 3 && (
          <p style={{ margin: 0, fontSize: '0.6rem', color: 'var(--text-dim)' }}>+{events.length - 3} más</p>
        )}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedEvents, setSelectedEvents] = useState([])

  const days = useMemo(() => getCalendarDays(year, month), [year, month])

  // Build events map: dateStr → events[]
  const eventMap = useMemo(() => {
    const map = {}
    const tasks = getAllLocalTasks()
    tasks.forEach(t => {
      const fields = getTaskFields(t.id)
      if (!fields?.deadline || fields?.completedState) return
      const d = parseDeadline(fields.deadline)
      if (!d) return
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const priority = PRIORITY_OPTIONS[fields.priority]
      const stage    = STAGE_OPTIONS[fields.stage]
      const color = priority?.color ?? '#60A5FA'
      if (!map[key]) map[key] = []
      map[key].push({
        id: t.id,
        title: t.text || 'Comisión',
        client: fields.client || '',
        color,
        priority: priority?.name ?? '—',
        stage: stage?.name ?? '—',
        deadline: fields.deadline,
      })
    })
    return map
  }, [])

  function getEvents(date) {
    if (!date) return []
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    return eventMap[key] ?? []
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Count total upcoming deadlines this month
  const monthDeadlines = days.filter(Boolean).reduce((n, d) => n + getEvents(d).length, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, transparent 60%)' }} />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">📅</div>
            <div>
              <p className="page-header-eyebrow">PLANIFICACIÓN</p>
              <h1 className="page-header-title">Calendario</h1>
              <p className="page-header-sub">
                {monthDeadlines} deadline{monthDeadlines !== 1 ? 's' : ''} en {MONTHS_ES[month]} {year}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <button className="btn-outline" onClick={prevMonth} aria-label="Mes anterior">‹</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {MONTHS_ES[month]} {year}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-outline" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{ fontSize: '0.75rem' }}>
              Hoy
            </button>
            <button className="btn-outline" onClick={nextMonth} aria-label="Mes siguiente">›</button>
          </div>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {DAYS_ES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {days.map((date, i) => (
            <DayCell
              key={i}
              date={date}
              events={getEvents(date)}
              isToday={date ? isSameDay(date, today) : false}
              onDayClick={(d, ev) => { setSelectedDay(d); setSelectedEvents(ev) }}
            />
          ))}
        </div>

        {/* Day detail modal */}
        {selectedDay && selectedEvents.length > 0 && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedDay(null)}>
            <div className="modal-panel" style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {selectedDay.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
                <button className="modal-close" onClick={() => setSelectedDay(null)} aria-label="Cerrar">×</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedEvents.map(ev => (
                  <div key={ev.id} style={{
                    background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem', borderLeft: `3px solid ${ev.color}`,
                  }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{ev.title}</p>
                    {ev.client && <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>👤 {ev.client}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', background: ev.color + '22', color: ev.color, padding: '2px 6px', borderRadius: 99 }}>
                        {ev.priority}
                      </span>
                      <span style={{ fontSize: '0.68rem', background: 'var(--surface)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 99, border: '1px solid var(--border)' }}>
                        {ev.stage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
