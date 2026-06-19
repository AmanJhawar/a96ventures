"use client"

import { useState } from 'react'
import { X } from 'lucide-react'

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
}

// Extract the Google Drive file ID from sharing URLs and format as direct CDN link
function parseGoogleDriveLink(url: string): string {
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
  if (!value && inputValue !== '') {
    setInputValue('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (val.trim()) {
      const resolvedUrl = parseGoogleDriveLink(val)
      onChange(resolvedUrl)
    }
  }

  if (value) {
    const imgSrc = value.startsWith('http') ? value : `/assets/${value}`
    return (
      <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-48 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="Uploaded preview" className="max-h-full object-contain" />
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
    <div className="flex flex-col gap-2">
      <input
        type="url"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="e.g., https://drive.google.com/file/d/.../view"
        className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black bg-white transition-colors duration-150"
      />
      <p className="text-[10px] text-gray-400 leading-tight">
        Paste a Google Drive link (must be set to &quot;Anyone with the link can view&quot;).
      </p>
    </div>
  )
}

