"use client"

import { useState, useEffect } from 'react'
import { UploadCloud, X } from 'lucide-react'

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
}

// Extract the Google Drive file ID from sharing URLs and format as direct CDN link
export function parseGoogleDriveLink(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  
  // If it's already a direct Googleusercontent CDN link, use it directly
  if (trimmed.startsWith('https://lh3.googleusercontent.com/d/')) {
    return trimmed
  }

  // Matches docs.google.com/file/d/FILE_ID/view... or drive.google.com/open?id=FILE_ID
  const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`
  }
  
  return trimmed
}

export function ImageDropzone({ value, onChange }: ImageDropzoneProps) {
  const [inputValue, setInputValue] = useState('')

  // Sync internal state when value is cleared
  useEffect(() => {
    if (!value) {
      setInputValue('')
    }
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (val.trim()) {
      const resolvedUrl = parseGoogleDriveLink(val)
      onChange(resolvedUrl)
    }
  }

  if (value) {
    const imgSrc = value.startsWith('data:') || value.startsWith('http') ? value : `/assets/${value}`
    return (
      <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-48 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="Uploaded preview" className="max-h-full object-contain" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 p-2 rounded-full shadow-sm hover:bg-gray-100 hover:text-black transition-colors opacity-0 group-hover:opacity-100 duration-150 active:scale-[0.97]"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Paste Google Drive share link or image URL
        </label>
        <input
          type="url"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="e.g., https://drive.google.com/file/d/.../view"
          className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black bg-white transition-colors duration-150"
        />
      </div>

      <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50/50">
        <div className="flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-8 h-8 text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-1">Local file upload disabled</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
            Please upload your images to Google Drive, set sharing permissions to <strong>Anyone with the link can view</strong>, and paste the sharing link above.
          </p>
        </div>
      </div>
    </div>
  )
}

