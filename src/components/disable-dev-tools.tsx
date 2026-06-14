'use client'

import { useEffect, useState } from 'react'
import { Unlock, Lock } from 'lucide-react'

export default function DisableDevTools() {
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    if (disabled) return;

    // Disable right-click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    // Disable keyboard shortcuts for DevTools and Saving
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'S')) ||
        (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.metaKey && (e.key === 'U' || e.key === 'S'))
      ) {
        e.preventDefault()
      }
    }

    // Disable image dragging
    const handleDragStart = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('dragstart', handleDragStart)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('dragstart', handleDragStart)
    }
  }, [disabled])

  return (
    <div className="fixed bottom-4 right-4 z-[9999] opacity-20 hover:opacity-100 transition-opacity">
      <button 
        onClick={() => setDisabled(!disabled)}
        className={`p-3 rounded-full shadow-lg flex items-center justify-center border transition-colors ${disabled ? 'bg-white border-black shadow-[0_0_0_1px_black] text-black' : 'bg-black border-gray-800 text-white'}`}
        title={disabled ? "Lock DevTools" : "Unlock DevTools"}
      >
        {disabled ? <Unlock size={18} /> : <Lock size={18} />}
      </button>
    </div>
  )
}
