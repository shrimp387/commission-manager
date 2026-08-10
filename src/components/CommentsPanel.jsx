import React, { useState } from 'react'

export default function CommentsPanel({ comments, onChange }) {
  const [text, setText] = useState('')

  function addComment() {
    if (!text.trim()) return
    const updated = [
      ...comments,
      { id: Date.now(), text: text.trim(), author: 'Admin', createdAt: new Date().toISOString() }
    ]
    onChange(updated)
    setText('')
  }

  function deleteComment(id) {
    onChange(comments.filter(c => c.id !== id))
  }

  return (
    <div className="subpanel">
      <p className="subpanel-title">Comentarios ({comments.length})</p>
      <div className="comments-list">
        {comments.length === 0 && (
          <p className="comments-empty">Sin comentarios aún.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="comment-item">
            <div className="comment-header">
              <span className="comment-author">{c.author}</span>
              <span className="comment-time">{new Date(c.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <button className="comment-delete" onClick={() => deleteComment(c.id)} aria-label="Eliminar comentario">×</button>
            </div>
            <p className="comment-text">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="comment-input-row">
        <textarea
          className="form-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escribe un comentario..."
          rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
        />
        <button className="btn-sm-primary" onClick={addComment} disabled={!text.trim()}>
          Enviar
        </button>
      </div>
    </div>
  )
}
