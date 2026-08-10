export default function ResizeHandle({ onMouseDown, onDoubleClick }) {
  return (
    <div
      className="sidebar-resize-handle"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-label="Ajustar ancho del sidebar"
      aria-orientation="vertical"
    />
  )
}
