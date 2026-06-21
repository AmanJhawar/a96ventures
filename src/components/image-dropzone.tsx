"use client"

import { useState, useRef, useCallback } from 'react'
import { X, UploadCloud, Loader2, ImageIcon } from 'lucide-react'
import { auth } from '@/lib/firebase/config'

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageDropzone({ value, onChange }: ImageDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return

    setIsUploading(true)
    try {
      // 1. Get Signature
      const user = auth.currentUser
      if (!user) throw new Error('Not authenticated')
      const token = await user.getIdToken()

      const timestamp = Math.round((new Date()).getTime() / 1000)
      const sigRes = await fetch('/api/sign-cloudinary-params', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ paramsToSign: { timestamp } })
      })
      
      if (!sigRes.ok) throw new Error('Failed to get signature')
      const { signature, enforcedParams } = await sigRes.json()

      // 2. Upload to Cloudinary
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || '')
      
      // Append all server-enforced parameters that were included in the signature
      Object.keys(enforcedParams).forEach(key => {
        formData.append(key, enforcedParams[key])
      })
      formData.append('signature', signature)

      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'di2w0v5ah'
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      })

      if (!uploadRes.ok) throw new Error('Failed to upload image')
      const data = await uploadRes.json()
      
      if (data.secure_url) {
        onChange(data.secure_url)
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  if (value) {
    const imgSrc = value.startsWith('http') ? value : `/assets/${value}`
    return (
      <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-48 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="Uploaded preview" className="max-h-full object-contain transition-transform duration-[250ms] ease-[var(--ease-out)] group-hover:scale-[1.02] will-change-transform" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-500 p-2 rounded-full shadow-sm hover:bg-gray-100 hover:text-black transition-colors opacity-0 group-hover:opacity-100 duration-150 active:scale-[0.97]"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div 
      onClick={() => !isUploading && fileInputRef.current?.click()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-col items-center justify-center gap-3 w-full px-4 py-8 rounded-xl border-2 border-dashed text-sm focus:outline-none transition-all duration-[160ms] ease-[var(--ease-out)]
        ${isUploading ? 'opacity-70 cursor-not-allowed border-gray-200 bg-gray-50' : 'cursor-pointer'}
        ${isDragging ? 'border-black bg-gray-50 scale-[0.99]' : 'border-gray-300 hover:bg-gray-50 hover:border-gray-400'}
      `}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={onFileChange}
        accept="image/png, image/jpeg, image/webp, image/gif"
        className="hidden" 
      />
      
      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-[160ms] ${isDragging ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
        {isUploading ? (
          <Loader2 size={20} className="animate-spin text-gray-500" />
        ) : isDragging ? (
          <ImageIcon size={20} />
        ) : (
          <UploadCloud size={20} />
        )}
      </div>
      
      <div className="text-center">
        <p className={`font-medium transition-colors duration-[160ms] ${isDragging ? 'text-black' : 'text-gray-700'}`}>
          {isUploading ? 'Uploading...' : isDragging ? 'Drop image here' : 'Click or drag to upload'}
        </p>
        {!isUploading && (
          <p className="text-[11px] text-gray-400 mt-1">JPEG, PNG, WebP up to 10MB</p>
        )}
      </div>
    </div>
  )
}

