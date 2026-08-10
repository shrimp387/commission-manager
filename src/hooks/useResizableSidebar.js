import { useState, useEffect, useRef, useCallback } from 'react'
import { getConfig, setConfig } from '../store/appConfig.js'

const DEFAULT_WIDTH = 230
const MIN_WIDTH = 160
const MAX_WIDTH = 480

/**
 * Custom hook that encapsulates the sidebar resize interaction.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.11
 *
 * @returns {{ width: number, handleMouseDown: Function, handleDoubleClick: Function }}
 */
export function useResizableSidebar() {
  const [width, setWidth] = useState(() => getConfig().sidebarWidth ?? DEFAULT_WIDTH)

  // Mutable refs to track drag state without triggering re-renders mid-drag
  const dragState = useRef({ active: false, startX: 0, startWidth: 0, currentWidth: DEFAULT_WIDTH })

  const handleMouseMove = useCallback((e) => {
    if (!dragState.current.active) return
    const { startX, startWidth } = dragState.current
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (e.clientX - startX)))
    dragState.current.currentWidth = newWidth
    // Apply immediately via CSS variable for smooth, paint-synchronous feedback
    document.documentElement.style.setProperty('--sidebar-w', newWidth + 'px')
    setWidth(newWidth)
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!dragState.current.active) return
    dragState.current.active = false

    const finalWidth = dragState.current.currentWidth
    // Persist the new width
    setConfig('sidebarWidth', finalWidth)
    // Restore text selection
    document.body.style.userSelect = ''

    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  const handleMouseDown = useCallback((e) => {
    // No-op on mobile
    if (window.innerWidth <= 768) return

    e.preventDefault()
    const currentWidth = getConfig().sidebarWidth ?? DEFAULT_WIDTH

    dragState.current = {
      active: true,
      startX: e.clientX,
      startWidth: currentWidth,
      currentWidth,
    }

    // Prevent text selection during drag
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  const handleDoubleClick = useCallback(() => {
    setConfig('sidebarWidth', DEFAULT_WIDTH)
    document.documentElement.style.setProperty('--sidebar-w', DEFAULT_WIDTH + 'px')
    setWidth(DEFAULT_WIDTH)
  }, [])

  // Cleanup: remove any lingering listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
    }
  }, [handleMouseMove, handleMouseUp])

  return { width, handleMouseDown, handleDoubleClick }
}
