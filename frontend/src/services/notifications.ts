let _addNotification: ((n: { title: string; message: string; type: any; meta?: any }) => any) | null = null

export function registerAddNotification(fn: (n: { title: string; message: string; type: any; meta?: any }) => any) {
  _addNotification = fn
}

export function addNotificationToStore(n: { title: string; message: string; type: any; meta?: any }) {
  if (_addNotification) return _addNotification(n)
  return null
}

export function clearRegistration() {
  _addNotification = null
}
