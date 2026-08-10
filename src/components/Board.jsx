import React from 'react'
import Column from './Column.jsx'

export default function Board({ sections, onToggle, onSelect, onAdd, onDelete }) {
  return (
    <main className="board" role="main">
      {sections.map(section => (
        <Column
          key={section.id}
          section={section}
          onToggle={onToggle}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
        />
      ))}
    </main>
  )
}
