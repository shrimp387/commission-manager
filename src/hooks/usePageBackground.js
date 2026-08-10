import { useEffect } from 'react'
import { useConfig } from './useConfig.js'

/**
 * Applies the correct background image + overlay opacity to .app-main.
 * Priority: sectionBgs[pageId] > globalBgUrl > none
 */
export function usePageBackground(pageId) {
  const config = useConfig()

  useEffect(() => {
    const appMain = document.querySelector('.app-main')
    if (!appMain) return

    const pageBg = config.sectionBgs?.[pageId]
    const resolvedUrl = pageBg?.url || config.globalBgUrl || null

    // Determine overlay opacity (how dark the overlay is, 0=no overlay, 1=full black)
    // stored as "bg opacity" (1=fully visible bg), so overlayAlpha = 1 - bgOpacity
    let bgOpacity
    if (pageBg?.url) {
      bgOpacity = pageBg.opacity ?? 0.85
    } else {
      bgOpacity = config.globalBgOpacity ?? 0.85
    }
    const overlayAlpha = Math.round((1 - bgOpacity) * 255)
    const overlayHex = overlayAlpha.toString(16).padStart(2, '0')

    if (resolvedUrl) {
      appMain.style.backgroundImage = `url("${resolvedUrl}")`
      appMain.style.backgroundSize = 'cover'
      appMain.style.backgroundPosition = 'center'
      appMain.style.backgroundRepeat = 'no-repeat'
      appMain.style.backgroundAttachment = 'fixed'
      // Overlay: use a gradient on top of the image
      appMain.style.backgroundImage = [
        `linear-gradient(rgba(13,13,18,${1 - bgOpacity}), rgba(13,13,18,${1 - bgOpacity}))`,
        `url("${resolvedUrl}")`
      ].join(', ')
    } else {
      appMain.style.backgroundImage = ''
      appMain.style.backgroundSize = ''
      appMain.style.backgroundPosition = ''
      appMain.style.backgroundRepeat = ''
      appMain.style.backgroundAttachment = ''
    }
  }, [pageId, config.sectionBgs, config.globalBgUrl, config.globalBgOpacity])
}
