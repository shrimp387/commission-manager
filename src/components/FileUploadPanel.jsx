import React, { useRef } from 'react'

export default function FileUploadPanel({ attachments, onChange }) {
  const fileRef = useRef(null)

  function handleFiles(files) {
    const readers = Array.from(files).map(file => new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve({
        id: Date.now() + Math.random(),
        name: file.name,
        url: e.target.result,
        type: file.type,
        size: file.size,
        addedAt: new Date().toISOString(),
      })
      r.readAsDataURL(file)
    }))
    Promise.all(readers).then(newFiles => {
      const updated = [...attachments, ...newFiles]
      onChange(updated) // triggers setTaskField → localStorage save immediately
    })
  }

  function remove(id) { onChange(attachments.filter(a => a.id !== id)) }

  return (
    <div className="subpanel">
      <p className="subpanel-title">Archivos adjuntos ({attachments.length})</p>

      <div
        className="drop-zone drop-zone--sm"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        role="button"
        tabIndex={0}
        aria-label="Subir archivo"
      >
        <span aria-hidden="true">📎</span> Subir desde computadora
      </div>
      <input ref={fileRef} type="file" multiple className="sr-only" onChange={e => handleFiles(e.target.files)} />

      {attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map(a => (
            <div key={a.id} className="attachment-item">
              {a.type?.startsWith('image/') ? (
                <img src={a.url} alt={a.name} className="attachment-thumb" />
              ) : (
                <span className="attachment-icon">📄</span>
              )}
              <span className="attachment-name">{a.name}</span>
              <button className="attachment-remove" onClick={() => remove(a.id)} aria-label="Eliminar">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
