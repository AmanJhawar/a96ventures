"use client"

import { useState, useCallback } from 'react'
import { UploadCloud, X, Loader2 } from 'lucide-react'

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
}

// Client-side image compression using HTML5 Canvas
function compressImage(file: File, maxWidth = 1000, maxHeight = 1000, initialQuality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        let width = img.width
        let height = img.height

        // Calculate new dimensions if image exceeds maxWidth or maxHeight
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context not available'))
          return
        }

        // Fill with white background to handle PNG transparency gracefully
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)

        ctx.drawImage(img, 0, 0, width, height)

        // Compress as JPEG
        let quality = initialQuality
        let base64String = canvas.toDataURL('image/jpeg', quality)
        let sizeInBytes = (base64String.length * (3/4)) - (base64String.endsWith('==') ? 2 : base64String.endsWith('=') ? 1 : 0)

        // Target under 400KB to ensure we can store multiple images and text within Firestore's 1MB document limit
        const targetMaxSize = 400000
        while (sizeInBytes > targetMaxSize && quality > 0.2) {
          quality -= 0.1
          base64String = canvas.toDataURL('image/jpeg', quality)
          sizeInBytes = (base64String.length * (3/4)) - (base64String.endsWith('==') ? 2 : base64String.endsWith('=') ? 1 : 0)
        }

        resolve(base64String)
      }
      img.onerror = (err) => reject(err)
    }
    reader.onerror = (err) => reject(err)
  })
}

export function ImageDropzone({ value, onChange }: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.')
      return
    }

    setIsUploading(true)

    try {
      const compressedBase64 = await compressImage(file)
      onChange(compressedBase64)
      setIsUploading(false)
    } catch (err) {
      console.error("Error processing image", err)
      alert("Failed to compress and process image")
      setIsUploading(false)
    }
  }, [onChange])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await processFile(file)
  }, [processFile])

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
  }

  if (value) {
    const imgSrc = value.startsWith('data:') || value.startsWith('http') ? value : `/assets/${value}`
    return (
      <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-48 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="Uploaded" className="max-h-full object-contain" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 p-2 rounded-full shadow-sm hover:bg-gray-100 hover:text-black transition-colors opacity-0 group-hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        isDragging ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-black'
      }`}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-black animate-spin mb-3" />
          <p className="text-sm font-medium text-gray-700">Compressing & Saving...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-10 h-10 text-gray-400 mb-4" />
          <p className="text-sm font-medium text-black mb-1">Click to upload or drag and drop</p>
          <p className="text-xs text-gray-500">Image will be compressed and saved directly to the database</p>
        </div>
      )}
    </div>
  )
}
