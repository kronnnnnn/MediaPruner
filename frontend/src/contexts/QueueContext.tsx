import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'

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
}

const QueueContext = createContext<QueueContextValue | undefined>(undefined)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/queues/stream')

    es.addEventListener('open', () => {
      setConnected(true)
    })

    es.addEventListener('error', (e) => {
      // If connection closed or error, update connection state
      setConnected(false)
    })

    es.addEventListener('init', (ev: MessageEvent) => {
      try {
        const data = JSON.parse((ev as any).data)
        setTasks(data as QueueTask[])
      } catch (e) {
        // ignore parse errors
      }
    })

    es.addEventListener('task_update', (ev: MessageEvent) => {
      try {
        const data = JSON.parse((ev as any).data) as QueueTask
        setTasks((prev) => {
          const other = prev.filter(t => t.id !== data.id)
          return [data, ...other].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        })
      } catch (e) {
        // ignore
      }
    })

    return () => {
      es.close()
      setConnected(false)
    }
  }, [])

  return (
    <QueueContext.Provider value={{ tasks, connected }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueues() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueues must be used within QueueProvider')
  return ctx
}
