import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface QueueItem {
  id: number
  index: number
  status: string
  payload: any
  result: any
  started_at?: string | null
  finished_at?: string | null
}

export interface QueueTask {
  id: number
  type: string
  status: string
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  total_items: number
  completed_items: number
  meta?: any
  items: QueueItem[]
}

interface QueueContextValue {
  tasks: QueueTask[]
  connected: boolean
  // Refresh tasks snapshot on demand
  refresh: (limit?: number) => Promise<void>
}

const QueueContext = createContext<QueueContextValue | undefined>(undefined)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [connected, setConnected] = useState(false)

  // Try an initial HTTP fetch as a fallback in case the SSE 'init' event is missed/delivered before listeners are attached
  const fetchInitial = async (limit = 500) => {
    try {
      console.debug('[queues] Fetching initial snapshot via HTTP /api/queues/tasks', { limit })
      const res = await fetch(`/api/queues/tasks?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data as QueueTask[])
        console.debug('[queues] Loaded initial snapshot via HTTP', data.length)
>>>>>>> d2f6649 (fix(frontend): resolve TS unused-import errors and remove unused handler param)
=======
  // Try an initial HTTP fetch as a fallback in case the SSE 'init' event is missed/delivered before listeners are attached
  const fetchInitial = async (limit = 500) => {
    try {
      console.debug('[queues] Fetching initial snapshot via HTTP /api/queues/tasks', { limit })
      const res = await fetch(`/api/queues/tasks?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
>>>>>>> cc0c772 (chore(implement-queue): finalize queue feature & related fixes; add tests and build changes)
        setTasks(data as QueueTask[])
        console.debug('[queues] Loaded initial snapshot via HTTP', data.length)
      } else {
        console.debug('[queues] Failed to fetch initial snapshot', res.status)
      }
    } catch (e) {
      console.debug('[queues] HTTP initial snapshot fetch failed', e)
    }
  }

  // Expose a refresh method to allow pages to trigger a manual snapshot load
  const refresh = async (limit = 500) => {
    await fetchInitial(limit)
  }

  useEffect(() => {
    let es: EventSource | null = null
    let retry = 0
    let reconnectTimer: number | null = null
    let onFocus: (() => void) | null = null
    let onVisibility: (() => void) | null = null

    const connect = () => {
      // Load initial snapshot via HTTP to avoid missing the init event
      fetchInitial().catch(()=>{})
      try {
        console.debug('[queues] EventSource connecting to /api/queues/stream')
        es = new EventSource('/api/queues/stream')
      } catch (e) {
        console.debug('[queues] EventSource construction failed', e)
        scheduleReconnect()
        return
      }

      es.addEventListener('open', () => {
        retry = 0
        setConnected(true)
        console.debug('[queues] EventSource opened')
        // Refresh full snapshot on open to avoid missed init messages
        fetchInitial().catch(()=>{})
      })

      // Refresh snapshot when the window gains focus or becomes visible (handles navigating away/back)
      onFocus = () => fetchInitial().catch(()=>{})
      onVisibility = () => { if (document.visibilityState === 'visible') fetchInitial().catch(()=>{}) }
      window.addEventListener('focus', onFocus)
      window.addEventListener('visibilitychange', onVisibility)

      // cleanup listeners on disconnect
      const cleanupListeners = () => {
        if (onFocus) window.removeEventListener('focus', onFocus)
        if (onVisibility) window.removeEventListener('visibilitychange', onVisibility)
      }

      // ensure listeners removed when the SSE is closed
      es.addEventListener('error', () => {
        cleanupListeners()
      })

      es.addEventListener('error', (ev) => {
        setConnected(false)
        console.debug('[queues] EventSource error', ev)
        try { es?.close() } catch (e) { }
        scheduleReconnect()
      })

      es.addEventListener('init', (ev: MessageEvent) => {
        try {
          console.debug('[queues] Received init event')
          const data = JSON.parse((ev as any).data)
          setTasks(data as QueueTask[])
        } catch (e) {
          // ignore parse errors
          console.debug('[queues] Failed to parse init payload', e)
        }
      })

      es.addEventListener('task_update', (ev: MessageEvent) => {
        try {
          console.debug('[queues] Received task_update event')
          const data = JSON.parse((ev as any).data) as QueueTask
          setTasks((prev) => {
            const prevTask = prev.find(t => t.id === data.id)
            const other = prev.filter(t => t.id !== data.id)
            const newList = [data, ...other].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

            // Notify on status changes to completed/failed
            try {
              const prevStatus = prevTask?.status?.toLowerCase()
              const newStatus = data.status?.toLowerCase()
              if (prevStatus !== newStatus && (newStatus === 'completed' || newStatus === 'failed')) {
                import('../services/notifications').then(mod => {
                  const title = `Task #${data.id} ${data.type} ${newStatus}`
                  const meta = { task_id: data.id }
                  const msg = data.meta && data.meta.path ? `${data.meta.path}` : `${data.total_items} items`;
                  mod.addNotificationToStore({ title, message: msg, type: newStatus === 'failed' ? 'error' : 'success', meta })
                }).catch(()=>null)
              }
            } catch (e) {
              // ignore notification errors
            }

            return newList
          })
        } catch (e) {
          console.debug('[queues] Failed to parse task_update payload', e)
        }
      })
    }

    const scheduleReconnect = () => {
      if (reconnectTimer) return
      retry = Math.min(10, retry + 1)
      const delay = Math.min(30, Math.pow(2, Math.min(retry, 6)))
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay * 1000) as unknown as number
    }

    connect()

    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      try { es?.close() } catch (e) { }
      setConnected(false)
      // Remove global listeners in case component unmounts
      if (onFocus) window.removeEventListener('focus', onFocus)
      if (onVisibility) window.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <QueueContext.Provider value={{ tasks, connected, refresh }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueues() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueues must be used within QueueProvider')
  return ctx
}
