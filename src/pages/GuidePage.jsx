import React, { useState, useEffect, useCallback, useRef } from 'react'

const BLOCK_TYPES = [
  { type: 'h1', label: 'Encabezado 1', icon: 'H1' },
  { type: 'h2', label: 'Encabezado 2', icon: 'H2' },
  { type: 'h3', label: 'Encabezado 3', icon: 'H3' },
  { type: 'paragraph', label: 'Párrafo', icon: '¶' },
  { type: 'bullet', label: 'Lista con viñetas', icon: '•' },
  { type: 'numbered', label: 'Lista numerada', icon: '1.' },
  { type: 'image', label: 'Imagen', icon: '🖼' },
  { type: 'link', label: 'Link / Embed', icon: '🔗' },
  { type: 'divider', label: 'Separador', icon: '—' },
]

const DEFAULT_BLOCKS = [
  { id: 1, type: 'h1', content: 'Guía del Estudio' },
  { id: 2, type: 'h2', content: 'Etapas de una comisión' },
  { id: 3, type: 'bullet', content: 'Sketch/Boceto — validar composición y dirección visual' },
  { id: 4, type: 'bullet', content: 'Lineart/Línea — definir contornos y limpieza' },
  { id: 5, type: 'bullet', content: 'Color base — establecer paleta y masas principales' },
  { id: 6, type: 'bullet', content: 'Sombreado y detalles — volumen, textura y entrega final' },
  { id: 7, type: 'h2', content: 'Reglas de revisión' },
  { id: 8, type: 'bullet', content: 'Un solo canal de feedback por comisión' },
  { id: 9, type: 'bullet', content: 'Mover la tarjeta al completar cada etapa' },
  { id: 10, type: 'h2', content: 'Atención al cliente' },
  { id: 11, type: 'paragraph', content: 'Responder mensajes en máximo 48 horas. Mantener al cliente informado del progreso en cada etapa.' },
]

function Block({ block, index, total, onChange, onDelete, onMoveUp, onMoveDown, onAddAfter }) {
  const [editing, setEditing] = useState(false)
  const [hover, setHover] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function handleBlur(e) {
    onChange(block.id, e.target.innerText || e.target.value)
    setEditing(false)
  }

  const Tag = block.type === 'h1' ? 'h1'
    : block.type === 'h2' ? 'h2'
    : block.type === 'h3' ? 'h3'
    : 'div'

  return (
    <div
      className={`guide-block guide-block--${block.type} ${hover ? 'guide-block--hover' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowAddMenu(false) }}
    >
      {/* Block controls */}
      {hover && (
        <div className="block-controls" aria-label="Controles del bloque">
          <button className="block-ctrl-btn" onClick={onMoveUp} disabled={index === 0} title="Subir" aria-label="Mover bloque arriba">↑</button>
          <button className="block-ctrl-btn" onClick={onMoveDown} disabled={index === total - 1} title="Bajar" aria-label="Mover bloque abajo">↓</button>
          <button className="block-ctrl-btn block-ctrl-btn--delete" onClick={() => onDelete(block.id)} title="Eliminar" aria-label="Eliminar bloque">×</button>
        </div>
      )}

      {/* Divider */}
      {block.type === 'divider' && <hr className="guide-divider" />}

      {/* Image */}
      {block.type === 'image' && (
        <div className="guide-image-block">
          {block.content?.startsWith('http') || block.content?.startsWith('data:') ? (
            <img src={block.content} alt="Imagen del bloque" className="guide-img" />
          ) : (
            <div
              className="guide-img-placeholder"
              onClick={() => setEditing(true)}
            >
              🖼 Haz clic para pegar URL de imagen
            </div>
          )}
          {editing && (
            <input
              ref={inputRef}
              className="form-input"
              defaultValue={block.content}
              onBlur={handleBlur}
              placeholder="https://ejemplo.com/imagen.jpg"
            />
          )}
        </div>
      )}

      {/* Link */}
      {block.type === 'link' && (
        <div className="guide-link-block" onClick={() => setEditing(true)}>
          {editing ? (
            <input
              ref={inputRef}
              className="form-input"
              defaultValue={block.content}
              onBlur={handleBlur}
              placeholder="https://enlace.com"
            />
          ) : (
            <a href={block.content} target="_blank" rel="noopener noreferrer" className="guide-link">
              🔗 {block.content || 'Haz clic para agregar enlace'}
            </a>
          )}
        </div>
      )}

      {/* Text blocks */}
      {!['divider', 'image', 'link'].includes(block.type) && (
        <Tag
          className={`guide-text guide-text--${block.type}`}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onClick={() => setEditing(true)}
          ref={inputRef}
          data-placeholder={`${BLOCK_TYPES.find(b => b.type === block.type)?.label}...`}
        >
          {block.content}
        </Tag>
      )}

      {/* Add block button */}
      {hover && (
        <div className="block-add-wrapper">
          <button
            className="block-add-btn"
            onClick={() => setShowAddMenu(m => !m)}
            aria-label="Agregar bloque"
            aria-expanded={showAddMenu}
          >+</button>
          {showAddMenu && (
            <div className="block-add-menu" role="menu">
              {BLOCK_TYPES.map(bt => (
                <button
                  key={bt.type}
                  className="block-add-option"
                  role="menuitem"
                  onClick={() => { onAddAfter(index, bt.type); setShowAddMenu(false) }}
                >
                  <span className="block-add-icon" aria-hidden="true">{bt.icon}</span>
                  {bt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GuidePage() {
  const [blocks, setBlocks] = useState(() => {
    try {
      const saved = localStorage.getItem('studio_guide')
      return saved ? JSON.parse(saved) : DEFAULT_BLOCKS
    } catch { return DEFAULT_BLOCKS }
  })
  const [saveStatus, setSaveStatus] = useState(null) // 'saving' | 'saved'
  const [showAddMenu, setShowAddMenu] = useState(false)
  const saveTimer = useRef(null)

  // Autosave with debounce
  useEffect(() => {
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem('studio_guide', JSON.stringify(blocks))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 2000)
    }, 1000)
    return () => clearTimeout(saveTimer.current)
  }, [blocks])

  function newId() { return Date.now() + Math.random() }

  function updateBlock(id, content) {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, content } : b))
  }

  function deleteBlock(id) {
    setBlocks(bs => bs.filter(b => b.id !== id))
  }

  function moveUp(index) {
    if (index === 0) return
    setBlocks(bs => {
      const updated = [...bs]
      ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
      return updated
    })
  }

  function moveDown(index) {
    setBlocks(bs => {
      if (index === bs.length - 1) return bs
      const updated = [...bs]
      ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
      return updated
    })
  }

  function addAfter(index, type) {
    const newBlock = { id: newId(), type, content: '' }
    setBlocks(bs => {
      const updated = [...bs]
      updated.splice(index + 1, 0, newBlock)
      return updated
    })
  }

  function addAtEnd(type) {
    setBlocks(bs => [...bs, { id: newId(), type, content: '' }])
    setShowAddMenu(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg page-header-bg--teal" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon" aria-hidden="true">📖</div>
            <div>
              <p className="page-header-eyebrow">DOCUMENTACIÓN</p>
              <h1 className="page-header-title">Guía del Estudio</h1>
              <p className="page-header-sub">Políticas, procesos y etapas de tus comisiones.</p>
            </div>
          </div>
          <div className="page-header-actions">
            {saveStatus === 'saving' && <span className="save-indicator">Guardando...</span>}
            {saveStatus === 'saved' && <span className="save-indicator save-indicator--ok">✓ Guardado</span>}
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="guide-editor">
          {blocks.map((block, index) => (
            <Block
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              onChange={updateBlock}
              onDelete={deleteBlock}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onAddAfter={addAfter}
            />
          ))}

          {/* Add block at end */}
          <div className="guide-add-end">
            <button
              className="guide-add-end-btn"
              onClick={() => setShowAddMenu(m => !m)}
              aria-expanded={showAddMenu}
            >
              + Añadir bloque
            </button>
            {showAddMenu && (
              <div className="block-add-menu block-add-menu--bottom" role="menu">
                {BLOCK_TYPES.map(bt => (
                  <button
                    key={bt.type}
                    className="block-add-option"
                    role="menuitem"
                    onClick={() => addAtEnd(bt.type)}
                  >
                    <span className="block-add-icon" aria-hidden="true">{bt.icon}</span>
                    {bt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
