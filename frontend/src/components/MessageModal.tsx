import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

export type MessageType = 'success' | 'error' | 'info' | 'warning'

interface MessageModalProps {
  isOpen: boolean
  title: string
  message: string
  type?: MessageType
  onClose: () => void
}

export default function MessageModal({ 
  isOpen, 
  title, 
  message, 
  type = 'info', 
  onClose 
}: MessageModalProps) {
  if (!isOpen) return null

  const icons = {
    success: <CheckCircle className="w-12 h-12 text-green-400" />,
    error: <AlertCircle className="w-12 h-12 text-red-400" />,
    warning: <AlertTriangle className="w-12 h-12 text-yellow-400" />,
    info: <Info className="w-12 h-12 text-blue-400" />,
  }

  const borderColors = {
    success: 'border-green-500',
    error: 'border-red-500',
    warning: 'border-yellow-500',
    info: 'border-blue-500',
  }

  const buttonColors = {
    success: 'bg-green-600 hover:bg-green-700',
    error: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    info: 'bg-blue-600 hover:bg-blue-700',
  }

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
        onClick={onClose}
      >
        <div 
          className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden border-t-4 ${borderColors[type]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 text-center">
            <div className="flex justify-center mb-4">
              {icons[type]}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
            <p className="text-gray-600 dark:text-gray-300 whitespace-pre-line">{message}</p>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className={`w-full py-2.5 ${buttonColors[type]} text-white font-medium rounded-lg transition-colors`}
            >
              OK
            </button>
          </div>
        </div>
      </div>


    </>
  )
}

// Hook for easier message modal management
import { useState, useCallback } from 'react'

export interface MessageState {
  isOpen: boolean
  title: string
  message: string
  type: MessageType
}

export function useMessageModal() {
  const [messageState, setMessageState] = useState<MessageState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  })

  const showMessage = useCallback((title: string, message: string, type: MessageType = 'info') => {
    setMessageState({ isOpen: true, title, message, type })
  }, [])

  const hideMessage = useCallback(() => {
    setMessageState(prev => ({ ...prev, isOpen: false }))
  }, [])

  return {
    messageState,
    showMessage,
    hideMessage,
  }
}
