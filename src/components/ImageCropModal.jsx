/**
 * ImageCropModal.jsx — Modal para recortar y crear thumbnail de la imagen
 */

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import './ImageCropModal.css'

export default function ImageCropModal({ imageUrl, onSave, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    
    setSaving(true)
    try {
      const croppedImage = await getCroppedImg(imageUrl, croppedAreaPixels)
      onSave(croppedImage)
    } catch (err) {
      console.error('Error cropping image:', err)
      alert('Error al recortar la imagen: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="crop-modal-overlay" onClick={onCancel}>
      <div className="crop-modal" onClick={e => e.stopPropagation()}>
        <div className="crop-modal-header">
          <h3>✂️ Crear Thumbnail</h3>
          <button className="crop-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="crop-container">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1} // Cuadrado 1:1 para thumbnail
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="crop-controls">
          <label>
            🔍 Zoom
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              onChange={e => setZoom(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="crop-modal-footer">
          <button className="crop-btn crop-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button 
            className="crop-btn crop-btn-save" 
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
          >
            {saving ? '⏳ Guardando...' : '💾 Guardar Thumbnail'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Crea una imagen recortada a partir de los píxeles seleccionados
 */
async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Set canvas size to the crop size
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Canvas is empty'))
        return
      }
      resolve(blob)
    }, 'image/jpeg', 0.95)
  })
}

/**
 * Helper para cargar la imagen
 */
function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', error => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}
