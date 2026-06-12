import { X } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onClose
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-[fadeIn_200ms_var(--ease-out)]" 
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-[fadeInUp_200ms_var(--ease-out)_forwards]">
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-black tracking-tight">{title}</h2>
            <button 
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-black transition-colors rounded-full hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>
          
          {description && (
            <p className="text-gray-500 mb-8 leading-relaxed">
              {description}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center sm:justify-end gap-3 mt-8">
            <button
              onClick={() => onClose()}
              className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-black bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => onConfirm()}
              className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-[background-color,transform] active:scale-[0.98]"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
