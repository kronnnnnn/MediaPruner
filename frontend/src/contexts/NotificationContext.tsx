import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Notification } from '../services/notifications'

interface NotificationContextValue {
  notifications: Notification[]
  markRead: (id: number) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    let canceled = false
    let unregister: (() => void) | null = null

    async function init() {
      const mod = await import('../services/notifications')
      setNotifications(mod.getNotifications())
      const cb = (list: Notification[]) => {
        if (!canceled) setNotifications(list)
      }
      mod.registerListener(cb)
      unregister = () => mod.unregisterListener(cb)
    }

    init()

    return () => {
      canceled = true
      if (unregister) unregister()
    }
  }, [])

  const markRead = (id: number) => {
    import('../services/notifications').then(mod => mod.markRead(id)).catch(() => null)
  }

  const clearAll = () => {
    import('../services/notifications').then(mod => mod.clearAll()).catch(() => null)
  }

  return (
    <NotificationContext.Provider value={{ notifications, markRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
