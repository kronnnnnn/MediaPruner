import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueues } from '../contexts/QueueContext'
import { Check, X, Clock, Play, Trash2, Copy, Film, ChevronRight, ChevronDown } from 'lucide-react' 
import MovieDetail from '../components/MovieDetail'
export default function Queues() {
  const { tasks, connected, refresh } = useQueues()
  const [activeTab, setActiveTab] = useState<'current'|'history'>('current')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [groupCollapsed, setGroupCollapsed] = useState<Record<number, Record<string, boolean>>>({})
  const [loadingItems, setLoadingItems] = useState<Record<number, boolean>>({})
  const [taskDetails, setTaskDetails] = useState<Record<number, unknown>>({})
  const [modalMovieId, setModalMovieId] = useState<number | null>(null)

  const [isClearing, setIsClearing] = useState(false)

  const toggle = async (id: number) => {
    // Toggle expanded state
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

    // If opening, and the task has no items loaded but has items according to metadata, fetch them
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const isOpen = !expanded[id]
    if (isOpen && (!task.items || task.items.length === 0) && task.total_items > 0) {
      const controller = new AbortController()
      let loadingShown = false
      const loadingDelay = 200 // ms
      const timer = window.setTimeout(() => {
        loadingShown = true
        setLoadingItems(prev => ({ ...prev, [id]: true }))
      }, loadingDelay)

      try {
        const res = await fetch(`/api/queues/tasks/${id}`, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          // Cache fetched task details locally so we can display items without changing context state
          setTaskDetails(prev => ({ ...prev, [data.id]: data }))
        } else {
          const text = await res.text().catch(() => '')
          import('../services/notifications').then(mod => mod.addNotificationToStore({ title: 'Failed to load task', message: text || res.statusText, type: 'error' })).catch(() => null)
        }
      } catch (e) {
        // Only notify if not an abort
        if ((e as any)?.name !== 'AbortError') {
          import('../services/notifications').then(mod => mod.addNotificationToStore({ title: 'Failed to load task', message: String(e), type: 'error' })).catch(() => null)
        }
      } finally {
        clearTimeout(timer)
        if (loadingShown) setLoadingItems(prev => ({ ...prev, [id]: false }))
      }
    }
  }

  const toggleGroup = (taskId: number, groupKey: string) => setGroupCollapsed(prev => ({ ...prev, [taskId]: { ...(prev[taskId] ?? {}), [groupKey]: !(prev[taskId]?.[groupKey] ?? true) } }))

  const currentTasks = tasks.filter(t => {
    const s = String(t.status).toLowerCase()
    const hasFailed = Array.isArray(t.items) && t.items.some((i: Record<string, unknown>) => String(i.status).toLowerCase() === 'failed')
    // Treat a completed task with any failed items as history
    if (s === 'completed' && hasFailed) return false
    return !['completed', 'deleted'].includes(s)
  })

  const historyTasks = tasks.filter(t => {
    const s = String(t.status).toLowerCase()
    const hasFailed = Array.isArray(t.items) && t.items.some((i: Record<string, unknown>) => String(i.status).toLowerCase() === 'failed')
    return ['completed', 'deleted', 'failed'].includes(s) || (s === 'completed' && hasFailed)
  })

  const statusOrder = ['running', 'queued', 'completed', 'failed', 'canceled']

  const statusIcon = (status: string) => {
    const s = String(status).toLowerCase()
    if (s === 'completed') return <Check className="w-4 h-4 text-green-400" />
    if (s === 'failed') return <X className="w-4 h-4 text-red-400" />
    if (s === 'queued') return <Clock className="w-4 h-4 text-yellow-400" />
    if (s === 'running') return <Play className="w-4 h-4 text-blue-400" />
    if (s === 'canceled' || s === 'deleted') return <Trash2 className="w-4 h-4 text-gray-400" />
    return <ChevronRight className="w-4 h-4 text-gray-400" />
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      const mod = await import('../services/notifications')
      mod.addNotificationToStore({ title: 'Copied', message: 'Copied to clipboard', type: 'success' })
    } catch (e) {
      // ignore
    }
  }

  const groupItemsByStatus = (items: unknown[]) => {
    const map: Record<string, unknown[]> = {}
    for (const it of items) {
      const s = String((it as Record<string, unknown>).status).toLowerCase()
      if (!map[s]) map[s] = []
      map[s].push(it)
    }
    // return in specific order
    return statusOrder.map(k => ({ key: k, items: map[k] ?? [] })).filter(g => g.items.length > 0)
  }

  const taskSourceLabel = (t: any) => {
    try {
      if (t.meta && t.meta.media_type) return t.meta.media_type.toUpperCase()
      if (t.meta && t.meta.path) return t.meta.path
      // fall back to first item payload path if present
      if (t.items && t.items.length > 0 && t.items[0].payload_parsed && t.items[0].payload_parsed.path) return t.items[0].payload_parsed.path
      return ''
    } catch (e) {
      return ''
    }
  }

  const taskTitle = (t: any) => {
    const typeLabel = String(t.type).replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    const path = taskSourceLabel(t)
    return path ? `${typeLabel} (${path})` : typeLabel
  }

  const renderTask = (t: any) => {
    const isOpen = !!expanded[t.id]
    const displayItems = (taskDetails[t.id] ? taskDetails[t.id].items : t.items)

    return (
      <div key={t.id} className="border rounded bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <button onClick={() => toggle(t.id)} aria-expanded={isOpen} className="w-full text-left p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span>#{t.id}</span>
              <span className="cursor-pointer text-gray-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              <span className="ml-2">— {taskTitle(t)}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Items: {t.total_items} • Processed: {t.completed_items}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500 capitalize">{(String(t.status).toLowerCase() === 'completed' && ((taskDetails[t.id]?.items ?? t.items) && (taskDetails[t.id]?.items ?? t.items).some((i: any) => String(i.status).toLowerCase() === 'failed'))) ? 'Completed (with failures)' : t.status}</div>
          </div>
        </button>

        {isOpen && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="mb-2 text-sm text-gray-400">Task details</div>
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              {loadingItems[t.id] ? (
                <div className="text-sm text-gray-400">Loading items…</div>
              ) : (() => {
                const items = displayItems ?? []
                if (!items || items.length === 0) return <div className="text-sm text-gray-500">No items</div>
                return groupItemsByStatus(items).map(g => {
                  const collapsed = (groupCollapsed[t.id]?.[g.key] ?? true)
                  return (
                    <div key={g.key}>
                      <div className="flex items-center justify-between mb-2">
                        <div onClick={() => toggleGroup(t.id, g.key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(t.id, g.key) } }} aria-expanded={!collapsed} className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                          {statusIcon(g.key)} <span className="capitalize">{g.key}</span>
                          <span className="text-xs text-gray-400">• {g.items.length}</span>
                        </div>
                        <div>
                          <button onClick={() => toggleGroup(t.id, g.key)} aria-label={collapsed ? 'Expand' : 'Collapse'} className="p-1 text-xs text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {!collapsed && g.items.map((rawIt) => {
                        const it = rawIt as Record<string, unknown>
                        const id = Number(it.id)
                        const index = Number(it.index)
                        const status = String(it.status)
                        const startedAt = it.started_at as string | undefined
                        const finishedAt = it.finished_at as string | undefined
                        const movieTitle = it.movie_title as string | undefined
                        const payloadParsed = it.payload_parsed as Record<string, unknown> | undefined
                        const movieUrl = it.movie_url as string | undefined
                        const movieSummary = it.movie_summary as string | undefined
                        const result = it.result as unknown
                        const resultSummary = it.result_summary as string | undefined

                        return (
                          <div key={id} className="p-3 rounded bg-white dark:bg-gray-800 border flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">Item #{index} — <span className="capitalize">{status}</span></div>
                                <div className="text-xs text-gray-400">{startedAt ? new Date(startedAt).toLocaleString() : ''}{finishedAt ? ` — ${new Date(finishedAt).toLocaleString()}` : ''}</div>
                              </div>

                              { (movieTitle || (payloadParsed && payloadParsed.movie_id)) && (
                                <div className="mt-2 text-sm text-gray-300 flex items-center gap-2">
                                  <Film className="w-4 h-4 text-gray-400" />
                                  <div>
                                    <div className="text-sm font-semibold">
                                      { (payloadParsed && payloadParsed.movie_id) ? (
                                        <button type="button" onClick={() => setModalMovieId(Number(payloadParsed.movie_id))} className="hover:underline text-primary-400 font-semibold text-sm">
                                          {movieTitle ?? `#${payloadParsed.movie_id}`}
                                        </button>
                                      ) : movieUrl ? (
                                        <Link className="hover:underline text-primary-400" to={movieUrl}>{movieTitle ?? `#${payloadParsed?.movie_id}`}</Link>
                                      ) : (
                                        movieTitle ?? `#${payloadParsed?.movie_id}`
                                      )}
                                    </div>
                                    {movieSummary && <div className="text-xs text-gray-400">{movieSummary}</div>}
                                  </div>
                                </div>
                              )}

                              {resultSummary ? (
                                <div className="mt-1 text-xs">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${resultSummary.startsWith('Error') ? 'text-red-300' : 'text-gray-300 bg-gray-800/50'}`}>{resultSummary}</span>
                                </div>
                              ) : result && (
                                <div className="mt-1 text-xs text-gray-500">Result: <code className="break-words">{typeof result === 'string' ? result : JSON.stringify(result)}</code></div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {result && (
                                <button title="Copy result" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => copyText(typeof result === 'string' ? result : JSON.stringify(result))}>
                                  <Copy className="w-4 h-4 text-gray-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                    </div>
                  )
                })
              })() }
            </div>
          </div>
        )}
      </div>
    )
  }

  // Modal for single-movie preview from queue items
  const handleCloseModal = () => setModalMovieId(null)

  // Expand task if hash present or when triggered externally
  // Temporarily disabled: re-enable after fixing parsing issues
  // useEffect(() => {
  //   const checkHash = () => {
  //     const h = (window.location && window.location.hash) ? window.location.hash : ''
  //     const m = h.match(/^#task-(\d+)/)
  //     if (m) {
  //       const id = Number(m[1])
  //       setExpanded(prev => ({ ...prev, [id]: true }))
  //       // scroll into view
  //       setTimeout(() => {
  //         const el = document.getElementById(`task-${id}`)
  //         if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  //       }, 100)
  //     }
  //   }

  //   checkHash()

  //   const handler = () => checkHash()
  //   window.addEventListener('hashchange', handler)
  //   return () => window.removeEventListener('hashchange', handler)
  // }, [])

  async function doClearQueues() {
    setIsClearing(true)
    const scope = activeTab === 'history' ? 'history' : 'current'
    try {
      const res = await fetch(`/api/queues/tasks/clear?scope=${scope}`, { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        import('../services/notifications').then(mod => mod.addNotificationToStore({ title: 'Clear failed', message: text || res.statusText, type: 'error' })).catch(() => null)
      } else {
        const data = await res.json().catch(() => null)
        import('../services/notifications').then(mod => mod.addNotificationToStore({ title: 'Cleared', message: data ? `${data.tasks_cleared} tasks cleared` : 'Cleared queued tasks', type: 'success' })).catch(() => null)
        await refresh()
      }
    } catch (e) {
      import('../services/notifications').then(mod => mod.addNotificationToStore({ title: 'Clear failed', message: String(e), type: 'error' })).catch(() => null)
    }
    setIsClearing(false)
  }
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Queues</h1>
        <div className="flex items-center gap-4">
          <button onClick={doClearQueues} disabled={isClearing} className="px-3 py-1 text-sm rounded border border-red-700 text-red-300 hover:bg-red-700/10">{isClearing ? 'Clearing…' : 'Clear all queues'}</button>
          <div className={`text-sm ${connected ? 'text-green-600' : 'text-red-500'}`}>{connected ? 'Connected' : 'Disconnected'}</div>
        </div>
      </div>

      <div className="mb-4 border-b border-gray-700">
        <nav className="-mb-px flex gap-3">
          <button onClick={() => setActiveTab('current')} className={`px-3 py-2 ${activeTab === 'current' ? 'border-b-2 border-primary-500 font-semibold' : 'text-gray-400'}`}>Current</button>
          <button onClick={() => setActiveTab('history')} className={`px-3 py-2 ${activeTab === 'history' ? 'border-b-2 border-primary-500 font-semibold' : 'text-gray-400'}`}>History</button>
        </nav>
      </div>

      <div className="space-y-3">
        {(activeTab === 'current' ? currentTasks : historyTasks).map(t => renderTask(t))}
        { (activeTab === 'current' ? currentTasks : historyTasks).length === 0 && (
          <div className="text-sm text-gray-500">No tasks</div>
        )}
      </div>

      {modalMovieId && (
        <MovieDetail movieId={modalMovieId} onClose={handleCloseModal} />
      )}


    </div>
  )
}
