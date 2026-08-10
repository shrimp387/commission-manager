import React, { useRef, useState } from 'react'
import { uploadToR2, deleteFromR2, isR2Available } from '../lib/r2.js'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'

/**
 * Uploads a file — tries R2 first, falls back to Supabase Storage, then base64.
 */
async function uploadFile(file, taskId) {
  // Try R2 first
  if (isR2Available()) {
    const result = await uploadToR2(file, `attachments/${taskId}`, null)
    if (result) return { url: result.url, storageKey: result.key, backend: 'r2' }
  }

  // Fallback: Supabase Storage
  const userId = getCurrentUserId()
  if (supabase && userId) {
    const ext = file.name.split('.').pop()
    const path = `${userId}/${taskId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
    if (!error) {
      const { data: signed } = await supabase.storage.from('attachments').createSignedUrl(path, 60 * 60 * 24 * 365)
      return { url: signed?.signedUrl || '', storageKey: path, backend: 'supabase' }
    }
  }

  // Final fallback: base64
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = e => resolve({ url: e.target.result, storageKey: null, backend: 'base64' })
    r.readAsDataURL(file)
  })
}

export default function FileUploadPanel({ attachments, onChange, taskId }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files) {
    setUploading(true)
    try {
      const newFiles = await Promise.all(
        Array.from(files).map(async file => {
          const { url, storageKey, backend } = await uploadFile(file, taskId || 'unknown')
          return {
            id: Date.now() + Math.random(),
            name: file.name,
            url,
            storageKey: storageKey || null,
            backend: backend || 'base64',
            type: file.type,
            size: file.size,
            addedAt: new Date().toISOString(),
          }
        })
      )
      onChange([...attachments, ...newFiles])
    } finally {
      setUploading(false)
    }
  }

  async function remove(attachment) {
    // Delete from R2 or Supabase Storage
    if (attachment.storageKey) {
      if (attachment.backend === 'r2') {
        await deleteFromR2(attachment.storageKey)
      } else if (attachment.backend === 'supabase' && supabase) {
        await supabase.storage.from('attachments').remove([attachment.storageKey])
      }
    }
    onChange(attachments.filter(a => a.id !== attachment.id))
  }

  return (
    <div className="subpanel">
      <p className="subpanel-title">Archivos adjuntos ({attachments.length})</p>

      <div
        className="drop-zone drop-zone--sm"
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        role="button"
        tabIndex={0}
        aria-label="Subir archivo"
        style={{ opacity: uploading ? 0.6 : 1, cursor: uploading ? 'wait' : 'pointer' }}
      >
        {uploading
          ? <span>⏳ Subiendo...</span>
          : <><span aria-hidden="true">📎</span> Subir desde computadora</>
        }
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
              <button className="attachment-remove" onClick={() => remove(a)} aria-label="Eliminar">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
