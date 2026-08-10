import React, { useState, useEffect, useRef } from 'react'

function fmt(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export default function TimerPanel({ elapsed, running, onUpdate }) {
  const [secs, setSecs] = useState(elapsed || 0)
  const [active, setActive] = useState(running || false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (active) {
      intervalRef.current = setInterval(() => {
        setSecs(s => { const next = s + 1; onUpdate(next, true); return next })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [active])

  function toggle() { setActive(a => !a) }
  function reset() { setActive(false); setSecs(0); onUpdate(0, false) }

  return (
    <div className="subpanel">
      <p className="subpanel-title">Temporizador</p>
      <div className="timer-display" aria-live="polite" aria-label={`Tiempo: ${fmt(secs)}`}>
        {fmt(secs)}
      </div>
      <div className="timer-btns">
        <button
          className={`btn-sm-primary ${active ? 'btn-sm-danger' : ''}`}
          onClick={toggle}
          aria-pressed={active}
        >
          {active ? '⏹ Detener' : '▶ Iniciar'}
        </button>
        <button className="btn-sm-ghost" onClick={reset} disabled={secs === 0 && !active}>
          ↺ Reset
        </button>
      </div>
      {secs > 0 && (
        <p className="timer-total">Total acumulado: <strong>{fmt(secs)}</strong></p>
      )}
    </div>
  )
}
