import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastState {
  isOpen: boolean
  title: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toastState: ToastState
  showToast: (title: string, message: string, type?: ToastType, duration?: number) => void
  hideToast: () => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<ToastState>({ isOpen: false, title: '', message: '', type: 'info' })
  const timerRef = useRef<number | null>(null)

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setToastState(prev => ({ ...prev, isOpen: false }))
  }, [])

  const showToast = useCallback((title: string, message: string, type: ToastType = 'info', duration = 4000) => {
    setToastState({ isOpen: true, title, message, type })

    // Also persist notification for later review (via central notification store)
    try {
      import('../services/notifications').then(mod => mod.addNotificationToStore({ title, message, type })).catch(() => null)
    } catch (e) {
      // ignore if notifications registration not ready
    }

    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setToastState(prev => ({ ...prev, isOpen: false }))
      timerRef.current = null
    }, duration)
  }, [])

  const borderClass = { success: 'border-green-500', error: 'border-red-500', warning: 'border-yellow-500', info: 'border-blue-500' }[toastState.type]
  const IconComponent = { success: CheckCircle, error: AlertCircle, warning: AlertTriangle, info: Info }[toastState.type]
  const colorClass = { success: 'text-green-500', error: 'text-red-500', warning: 'text-yellow-500', info: 'text-blue-500' }[toastState.type]

  return (
    <ToastContext.Provider value={{ toastState, showToast, hideToast }}>
      {children}
      {/* Global toast UI (top-right) rendered into document.body so it is above any modal stacking context */}
      {toastState.isOpen && createPortal(
        <div className="fixed top-4 right-4 z-[9999]">
          <div className={`max-w-xs w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border-l-4 animate-mp-pop ${borderClass}`}>
            <div className="p-4 flex gap-3 items-start">
              <div className="flex-shrink-0 mt-0.5 text-blue-500">
                <IconComponent className={`w-6 h-6 ${colorClass}`} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{toastState.title}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line">{toastState.message}</div>
              </div>
              <div className="ml-2">
                <button onClick={hideToast} className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
