import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  // When true, the confirm button is disabled until the acknowledgement checkbox is checked
  requireAcknowledgement?: boolean
  acknowledgementLabel?: string
  onConfirm: () => void
  // Called when the footer cancel button is clicked
  onCancel: () => void
  // Called when the dialog is closed without explicit confirmation, e.g. overlay click or X button
  onClose?: () => void
  // Optional - when a long-running operation is active, show progress inside the dialog
  isLoading?: boolean
  progress?: { current: number; total: number; actionName?: string } | null
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  requireAcknowledgement = false,
  acknowledgementLabel = 'I understand this action may take a long time and affect server performance',
  onConfirm,
  onCancel,
  onClose,
  isLoading = false,
  progress = null,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const [ackChecked, setAckChecked] = useState(false)

  const variantStyles = {
    danger: {
      icon: 'bg-red-500/20 text-red-400',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'bg-yellow-500/20 text-yellow-400',
      button: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      icon: 'bg-blue-500/20 text-blue-400',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose ?? onCancel}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${styles.icon}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <button
            onClick={onClose ?? onCancel}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-gray-600 dark:text-gray-300 whitespace-pre-line">{message}</p>
          {requireAcknowledgement && (
            <div className="mt-4 flex items-center gap-2">
              <input id="ack" type="checkbox" className="w-4 h-4" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} />
              <label htmlFor="ack" className="text-sm text-gray-700 dark:text-gray-300">{acknowledgementLabel}</label>
            </div>
          )}

          {/* Progress display for long-running batch operations */}
          {isLoading && progress && (
            <div className="mt-4">
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">{progress.actionName || 'Processing'} — {progress.current} of {progress.total}</div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded overflow-hidden">
                <div className="h-2 bg-primary-600" style={{ width: `${Math.round((progress.current / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            {isLoading ? 'Cancel' : cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || (requireAcknowledgement && !ackChecked)}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${styles.button} ${isLoading || (requireAcknowledgement && !ackChecked) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Running...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
