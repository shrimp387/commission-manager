import React, { useState } from 'react'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

export default function DatePickerPopup({ value, onChange }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const selected = value ? new Date(value + 'T00:00:00') : null

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function selectDay(d) {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    onChange(`${year}-${mm}-${dd}`)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="datepicker">
      <p className="subpanel-title">Fecha límite</p>
      {value && (
        <p className="datepicker-current">Seleccionada: <strong>{value}</strong></p>
      )}
      <div className="datepicker-nav">
        <button className="dp-nav-btn" onClick={prevMonth} aria-label="Mes anterior">‹</button>
        <span className="dp-month-label">{MONTHS[month]} {year}</span>
        <button className="dp-nav-btn" onClick={nextMonth} aria-label="Mes siguiente">›</button>
      </div>
      <div className="dp-grid">
        {DAYS.map(d => <span key={d} className="dp-day-name">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />
          const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
          const isSelected = selected && d === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear()
          return (
            <button
              key={d}
              className={`dp-day ${isToday ? 'dp-today' : ''} ${isSelected ? 'dp-selected' : ''}`}
              onClick={() => selectDay(d)}
              aria-label={`${d} de ${MONTHS[month]}`}
              aria-pressed={isSelected}
            >{d}</button>
          )
        })}
      </div>
      {value && (
        <button className="dp-clear" onClick={() => onChange('')}>✕ Quitar fecha</button>
      )}
    </div>
  )
}
