export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: number
  title: string
  message: string
  type: NotificationType
  timestamp: string
  read: boolean
  meta?: Record<string, unknown>
}

let _notifications: Notification[] = []
let _listeners: Array<(list: Notification[]) => void> = []

export function getNotifications() {
  return _notifications.slice()
}

export function addNotificationToStore(payload: { title: string; message: string; type?: NotificationType; meta?: Record<string, unknown> }) {
  const n: Notification = {
    id: Date.now(),
    title: payload.title,
    message: payload.message,
    type: payload.type ?? 'info',
    timestamp: new Date().toISOString(),
    read: false,
    meta: payload.meta,
  }
  _notifications = [n, ..._notifications]
  _notify()
  return n
}

export function markRead(id: number) {
  const it = _notifications.find(n => n.id === id)
  if (it) it.read = true
  _notify()
}

export function clearAll() {
  _notifications = []
  _notify()
}

export function registerListener(cb: (list: Notification[]) => void) {
  _listeners.push(cb)
}

export function unregisterListener(cb: (list: Notification[]) => void) {
  _listeners = _listeners.filter(f => f !== cb)
}

function _notify() {
  const snap = _notifications.slice()
  _listeners.forEach(cb => {
    try {
      cb(snap)
    } catch (e) {
      // ignore listener errors
    }
  })
}
