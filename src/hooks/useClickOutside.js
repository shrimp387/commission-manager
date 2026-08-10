import { useEffect } from 'react'

/**
 * Calls `handler` when a mousedown event occurs outside the element referenced by `ref`.
 * @param {React.RefObject} ref - The ref of the element to watch.
 * @param {Function} handler - Called when a click outside occurs.
 * @param {boolean} [enabled=true] - When false, the listener is not attached.
 */
export function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    function handleMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        handler(e)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [ref, handler, enabled])
}
