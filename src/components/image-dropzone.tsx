"use client"

import { useState, useCallback } from 'react'
import { UploadCloud, X, Loader2 } from 'lucide-react'

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
  path?: string; // Kept for API compatibility but not used since we use Base64
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await processFile(file)
  }, [])

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processFile(file)
  }

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.')
      return
    }

    setIsUploading(true)

    try {
      // We will read the file and compress it heavily so it fits inside a Firestore Document (1MB limit)
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new window.Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          // Set max dimensions
          const MAX_WIDTH = 1200
          const MAX_HEIGHT = 1200
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)
          
          // Compress to JPEG with 80% quality
          const base64String = canvas.toDataURL('image/jpeg', 0.8)
          
          // Check size (rough estimate of base64 size)
          const sizeInBytes = (base64String.length * (3/4)) - 2
          if (sizeInBytes > 900000) { // Safety margin below 1MB
            alert('Image is still too large after compression. Please upload a smaller image.')
            setIsUploading(false)
            return
          }

          onChange(base64String)
          setIsUploading(false)
        }
      }
    } catch (err) {
      console.error("Error processing image", err)
      alert("Failed to process image")
      setIsUploading(false)
    }
  }

  if (value) {
    return (
      <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-48 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Uploaded" className="max-h-full object-contain" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 p-2 rounded-full shadow-sm hover:bg-red-50 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
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
        isDragging ? 'border-black bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
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
