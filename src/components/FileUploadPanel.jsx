import React, { useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'

/**
 * Uploads a file to Supabase Storage under `attachments/<userId>/<taskId>/<filename>`.
 * Falls back to base64 DataURL if Supabase is not available.
 */
async function uploadToStorage(file, taskId) {
  const userId = getCurrentUserId()
  if (!supabase || !userId) {
    // Fallback: base64 in memory
    return new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve({ url: e.target.result, storageKey: null })
      r.readAsDataURL(file)
    })
  }

  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const path = `${userId}/${taskId}/${fileName}`

  const { error } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) {
    console.warn('[storage] upload failed, falling back to base64:', error.message)
    // Fallback to base64
    return new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve({ url: e.target.result, storageKey: null })
      r.readAsDataURL(file)
    })
  }

  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  // Use signed URL approach for private buckets
  const { data: signedData } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year

  return {
    url: signedData?.signedUrl || data?.publicUrl || '',
    storageKey: path,
  }
}

export default function FileUploadPanel({ attachments, onChange, taskId }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files) {
    setUploading(true)
    try {
      const newFiles = await Promise.all(
        Array.from(files).map(async file => {
          const { url, storageKey } = await uploadToStorage(file, taskId || 'unknown')
          return {
            id: Date.now() + Math.random(),
            name: file.name,
            url,
            storageKey: storageKey || null,
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
    // Delete from Supabase Storage if it was uploaded there
    if (attachment.storageKey && supabase) {
      await supabase.storage.from('attachments').remove([attachment.storageKey])
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
