import React, { createContext, useContext, useState, ReactNode } from 'react'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: NotificationType
  timestamp: string
  read?: boolean
  meta?: any
}

interface NotificationContextValue {
  notifications: NotificationItem[]
  addNotification: (n: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => NotificationItem
  markRead: (id: string) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  function addNotification(n: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) {
    const item: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
      ...n,
    }
    setNotifications(prev => [item, ...prev])
    return item
  }

  // Register helper so other modules (e.g., Toast) can push notifications
  React.useEffect(() => {
    // lazy import to avoid circular deps
    import('../services/notifications').then(mod => {
      mod.registerAddNotification(({ title, message, type, meta }) => addNotification({ title, message, type, meta }))
    })
    return () => {
      import('../services/notifications').then(mod => mod.clearRegistration())
    }
  }, [])

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function clearAll() {
    setNotifications([])
  }

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, markRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
