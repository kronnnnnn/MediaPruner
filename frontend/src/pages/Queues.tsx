import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { queuesApi, moviesApi, tvShowsApi } from '../services/api'
import { useToast } from '../contexts/ToastContext'

interface QueueTask {
  id: number
  type: string
  status: string
  created_at: string
  total_items?: number
  completed_items?: number
  meta?: any
}

interface QueueItem {
  id: number
  index: number
  status: string
  payload?: string | null
  result?: string | null
  started_at?: string | null
  finished_at?: string | null
  display_name?: string
  parsedPayload?: any
  movie?: any
}

interface QueueTaskDetail extends QueueTask {
  items: QueueItem[]
}


export default function Queues() {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [loading, setLoading] = useState(false)
  const [sseStatus, setSseStatus] = useState<'connecting' | 'open' | 'error' | 'closed'>('connecting')
  // Expand/collapse state for tasks
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // Details cache per task id
  const [details, setDetails] = useState<Record<number, QueueTaskDetail | undefined>>({})
  const [detailsLoadingIds, setDetailsLoadingIds] = useState<Record<number, boolean>>({})
  const [cancelingIds, setCancelingIds] = useState<Record<number, boolean>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<Record<number, boolean>>({})
  const { showToast } = useToast()

  const loadInProgress = useRef(false)
  const expandedRef = useRef<Set<number>>(expanded)

  useEffect(() => { expandedRef.current = expanded }, [expanded])

  const load = async () => {
    if (loadInProgress.current) return
    loadInProgress.current = true
    setLoading(true)
    try {
      const res = await queuesApi.listTasks()
      // Hide completed tasks from the list (they fall off)
      // Hide completed and deleted/canceled tasks from the active list
      const visible = (res.data || []).filter((t: QueueTask) => !['completed','deleted','canceled'].includes(t.status))
      setTasks(visible)
      // Refresh details for any expanded tasks
      for (const id of expandedRef.current) {
        await loadTaskDetails(id)
      }
    } catch (e) {
      // ignore for now
    } finally {
      setLoading(false)
      loadInProgress.current = false
    }
  }

  const loadTaskDetails = async (id: number) => {
    setDetailsLoadingIds((s) => ({ ...s, [id]: true }))
    try {
      const res = await queuesApi.getTask(id)
      const task = res.data as QueueTaskDetail

      // Enrich items with human-friendly names when possible
      const enriched = await enrichTaskDetails(task)

      setDetails((s) => ({ ...s, [id]: enriched }))
    } catch (e) {
      // ignore
    } finally {
      setDetailsLoadingIds((s) => ({ ...s, [id]: false }))
    }
  }

  const lastTaskSnapshotRef = useRef<Record<number, Record<number, string>>>({})

  function updateSnapshot(task: QueueTask) {
    const map: Record<number, string> = {}
    // task may include items array
    ;(task as any).items?.forEach((it: any) => {
      map[it.id] = it.status
    })
    lastTaskSnapshotRef.current[task.id] = map
  }

  useEffect(() => {
    // Initial load
    load()

    // Use SSE EventSource to receive live updates and avoid polling flashes
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/queues/stream')

      es.addEventListener('init', (ev: MessageEvent) => {
        try {
          setSseStatus('open')
          const data = JSON.parse((ev as any).data)
          const visible = (data || []).filter((t: QueueTask) => !['completed','deleted','canceled'].includes(t.status))
          setTasks(visible)
          // initialize snapshots
          visible.forEach((t: any) => updateSnapshot(t))
        } catch (err) {
          // Ignore malformed init payload
        }
      })

      es.addEventListener('tasks', (ev: MessageEvent) => {
        try {
          setSseStatus('open')
          const data = JSON.parse((ev as any).data)
          const visible = (data || []).filter((t: QueueTask) => !['completed','deleted','canceled'].includes(t.status))
          setTasks(visible)
          visible.forEach((t: any) => updateSnapshot(t))
        } catch (err) {
          // ignore
        }
      })

      es.addEventListener('task_update', (ev: MessageEvent) => {
        try {
          setSseStatus('open')
          const updated = JSON.parse((ev as any).data) as QueueTask

          // detect item completions/failures and notify
          try {
            const prev = lastTaskSnapshotRef.current[updated.id] || {}
            const items = (updated as any).items || []
            items.forEach((it: any) => {
              const prevStatus = prev[it.id]
              if (prevStatus !== it.status) {
                // transitioned
                if (it.status === 'completed' || it.status === 'failed') {
                  const res = it.result ? (typeof it.result === 'string' ? it.result : JSON.stringify(it.result)) : ''
                  const summary = res ? (res.length > 120 ? res.substring(0, 117) + '...' : res) : ''
                  const title = `Task ${updated.id} — ${updated.type}`
                  const msg = `Item ${it.index} ${it.status}${summary ? ` — ${summary}` : ''}`
                  showToast(title, msg, it.status === 'failed' ? 'error' : 'success')
                }
              }
            })
          } catch (e) {
            // ignore detection errors
          }

          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== updated.id)
            if (!['completed','deleted','canceled'].includes(updated.status)) {
              const next = [updated, ...filtered]
              next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              return next
            }
            return filtered
          })

          // Refresh details if the task is currently expanded
          if (expandedRef.current && expandedRef.current.has(updated.id)) {
            loadTaskDetails(updated.id)
          }

          // Update our snapshot with latest
          updateSnapshot(updated)
        } catch (err) {
          // ignore
        }
      })

      es.onerror = () => {
        // Let the browser handle reconnect attempts (EventSource auto-reconnects).
        setSseStatus('error')
      }
    } catch (e) {
      // EventSource may not be available in some environments
    }

    return () => {
      if (es) es.close()
    }
  }, [])

  // keep details fresh for expanded tasks (handled from load())

  // Note: delete/cancel is handled via `handleConfirmDelete`; previous `handleCancel` compatibility helper removed to avoid unused declaration

  const handleConfirmDelete = async (id: number) => {
    try {
      setCancelingIds(s => ({ ...s, [id]: true }))
      const res = await queuesApi.cancelTask(id)
      showToast('Task Deleted', `Task ${res.data.task_id} deleted`, 'info')
      // Optimistically remove from list
      setTasks(prev => prev.filter(t => t.id !== id))
      // Also remove details cache
      setDetails(s => {
        const copy = { ...s }
        delete copy[id]
        return copy
      })
    } catch (e: any) {
      showToast('Delete Failed', e?.response?.data?.detail || 'Failed to delete task', 'error')
    } finally {
      setCancelingIds(s => ({ ...s, [id]: false }))
      setConfirmingDelete(s => ({ ...s, [id]: false }))
      // reload list to sync real state
      await load()
    }
  }

  const toggleExpand = async (id: number) => {
    setExpanded((s) => {
      const copy = new Set(s)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
    if (!details[id]) {
      await loadTaskDetails(id)
    }
  }

  // Enrich task details by resolving movie/show/episode IDs into human-friendly labels
  async function enrichTaskDetails(task: QueueTaskDetail): Promise<QueueTaskDetail> {
    try {
      const items = task.items || []

      // Parse payloads and collect IDs to fetch
      const movieIds = new Set<number>()
      const showIds = new Set<number>()
      const episodeLookups: { episodeId: number; showId?: number }[] = []

      const parsedPayloads = items.map((it) => {
        let parsed = null
        try {
          parsed = typeof it.payload === 'string' ? JSON.parse(it.payload) : it.payload
        } catch {
          parsed = it.payload
        }
        if (parsed) {
          if (parsed.movie_id) movieIds.add(parsed.movie_id)
          if (parsed.show_id) showIds.add(parsed.show_id)
          if (parsed.episode_id) {
            // prefer payload show_id, else fall back to task.meta.show_id
            const showId = parsed.show_id || (task.meta && (task.meta as any).show_id)
            if (showId) showIds.add(showId)
            episodeLookups.push({ episodeId: parsed.episode_id, showId })
          }
        }
        return parsed
      })

      // Fetch movies
      const moviesMap: Record<number, any> = {}
      await Promise.all(Array.from(movieIds).map(async (id) => {
        try {
          const r = await moviesApi.getMovie(id)
          moviesMap[id] = r.data
        } catch {
          // ignore
        }
      }))

      // Fetch shows and episodes per show
      const showsMap: Record<number, any> = {}
      const showEpisodesMap: Record<number, any[]> = {}
      await Promise.all(Array.from(showIds).map(async (id) => {
        try {
          const r = await tvShowsApi.getTVShow(id)
          showsMap[id] = r.data
        } catch {
          // ignore
        }
        try {
          const r2 = await tvShowsApi.getEpisodes(id)
          showEpisodesMap[id] = r2.data
        } catch {
          // ignore
        }
      }))

      // Attach display_name, parsed payload and resolved movie/show objects to items
      const newItems = items.map((it, idx) => {
        const parsed = parsedPayloads[idx]
        let display_name: string | undefined
        let movieObj: any = undefined
        if (parsed) {
          if (parsed.movie_id && moviesMap[parsed.movie_id]) {
            movieObj = moviesMap[parsed.movie_id]
            display_name = `${movieObj.title} (movie)`
          } else if (parsed.show_id && showsMap[parsed.show_id]) {
            display_name = `${showsMap[parsed.show_id].title} (show)`
          } else if (parsed.episode_id) {
            const entry = episodeLookups.find(e => e.episodeId === parsed.episode_id)
            const showId = entry?.showId
            const eps = showId ? (showEpisodesMap[showId] || []) : []
            const ep = eps.find((e: any) => e.id === parsed.episode_id)
            if (ep) {
              const showTitle = showId && showsMap[showId] ? showsMap[showId].title : 'Show'
              display_name = `${showTitle} S${ep.season_number}E${ep.episode_number} — ${ep.title || ''}`
            } else {
              display_name = `Episode #${parsed.episode_id}`
            }
          } else if (parsed.path) {
            display_name = parsed.path
          }
        }

        return { ...it, display_name, parsedPayload: parsed, movie: movieObj }
      })

      return { ...task, items: newItems }
    } catch (e) {
      return task
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-2xl font-semibold">Queue</h2>
        {sseStatus === 'open' ? (
          <div className="text-sm text-green-400">● Live</div>
        ) : sseStatus === 'connecting' ? (
          <div className="text-sm text-yellow-400">● Connecting…</div>
        ) : sseStatus === 'error' ? (
          <div className="text-sm text-red-400">● Disconnected</div>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        loading ? (
          <div>Loading…</div>
        ) : (
          <div className="text-gray-500">No queued tasks found.</div>
        )
      ) : (
        <div className="space-y-3">
          {/* Show subtle inline updating indicator while polling to avoid full flash */}
          {loading && <div className="text-sm text-gray-400">Updating…</div>}

          {tasks.map((t) => (
            <div key={t.id} className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-4">
                <div className="flex-1 cursor-pointer" onClick={() => toggleExpand(t.id)}>
                  <div className="font-medium">#{t.id} — {t.type}</div>
                  <div className="text-sm text-gray-500">Status: {t.status} • Created: {new Date(t.created_at).toLocaleString()}</div>
                  <div className="text-sm text-gray-500">Items: {t.total_items ?? '-'} • Completed: {t.completed_items ?? '-'}</div>
                </div>
                {!expanded.has(t.id) && (
                  <div className="ml-auto">
                    {confirmingDelete[t.id] ? (
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-sm"
                          onClick={() => handleConfirmDelete(t.id)}
                          disabled={cancelingIds[t.id]}
                        >
                          {cancelingIds[t.id] ? 'Deleting...' : 'Delete'}
                        </button>
                        <button
                          className="px-4 py-2 rounded-md text-sm font-medium border border-blue-500 text-blue-500 bg-white hover:bg-blue-50"
                          onClick={() => setConfirmingDelete(s => ({ ...s, [t.id]: false }))}
                          disabled={cancelingIds[t.id]}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="px-3 py-2 rounded-md text-sm font-medium border border-red-600 text-red-600 bg-transparent hover:bg-red-50"
                        onClick={() => setConfirmingDelete(s => ({ ...s, [t.id]: true }))}
                        disabled={cancelingIds[t.id] || t.status === 'deleted' || t.status === 'completed'}
                      >
                        {cancelingIds[t.id] ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {expanded.has(t.id) && (
                <div className="mt-3">
                  {detailsLoadingIds[t.id] && <div className="text-sm text-gray-400">Loading details…</div>}
                  {details[t.id] && (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-500">Type: <strong>{details[t.id]!.type}</strong></div>
                      <div className="text-sm text-gray-500">Status: <strong>{details[t.id]!.status}</strong></div>
                      <div className="text-sm text-gray-500">Created: {new Date(details[t.id]!.created_at).toLocaleString()}</div>
                      <div className="text-sm text-gray-500">Items: {details[t.id]!.total_items ?? '-'} • Completed: {details[t.id]!.completed_items ?? '-'}</div>

                      <div className="mt-2">
                        {details[t.id]!.items?.length === 0 && <div className="text-gray-500">No items</div>}
                        {details[t.id]!.items?.map((it) => (
                          <details key={it.id} className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                            <summary className="flex items-center justify-between cursor-pointer">
                              <div className="text-sm">{it.display_name ? <><span className="font-medium">{it.display_name}</span> <span className="text-xs text-gray-400 ml-2">• {it.status}</span></> : <>Item #{it.index} • <span className="font-medium">{it.status}</span></>}</div>
                              <div className="text-xs text-gray-400">{it.started_at ? new Date(it.started_at).toLocaleString() : ''} {it.finished_at ? ` → ${new Date(it.finished_at).toLocaleString()}` : ''}</div>
                            </summary>
                            <div className="mt-2">
                              <div className="text-xs text-gray-500 mb-1">Payload</div>
                              {it.parsedPayload && it.parsedPayload.movie_id && it.movie ? (
                                <div className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded mb-2">
                                  <div className="text-sm">
                                    <strong>Movie:</strong>{' '}
                                    <Link to={`/movies?movieId=${it.movie.id}`} className="text-blue-400 hover:underline">
                                      {it.movie.title}
                                    </Link>
                                    <span className="text-xs text-gray-400 ml-2">• id:{it.movie.id}</span>
                                  </div>
                                  {it.parsedPayload.path && (
                                    <div className="text-xs text-gray-500 mt-1"><strong>Path:</strong> {it.parsedPayload.path}</div>
                                  )}
                                </div>
                              ) : it.parsedPayload && it.parsedPayload.path ? (
                                <div className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded mb-2">
                                  <div className="text-sm"><strong>Path:</strong> {it.parsedPayload.path}</div>
                                </div>
                              ) : (
                                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mb-2 overflow-auto">{formatJson(it.payload)}</pre>
                              )}

                              <div className="text-xs text-gray-500 mb-1">Result</div>
                              {renderResult(it.result)}
                            </div>
                          </details>
                        ))}
                      </div>

                      <div className="flex justify-end mt-3">
                        {confirmingDelete[t.id] ? (
                          <div className="flex gap-2">
                            <button
                              className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-sm"
                              onClick={() => handleConfirmDelete(t.id)}
                              disabled={cancelingIds[t.id]}
                            >
                              {cancelingIds[t.id] ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                              className="px-4 py-2 rounded-md text-sm font-medium border border-blue-500 text-blue-500 bg-white hover:bg-blue-50"
                              onClick={() => setConfirmingDelete(s => ({ ...s, [t.id]: false }))}
                              disabled={cancelingIds[t.id]}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="px-3 py-2 rounded-md text-sm font-medium border border-red-600 text-red-600 bg-transparent hover:bg-red-50"
                            onClick={() => setConfirmingDelete(s => ({ ...s, [t.id]: true }))}
                            disabled={cancelingIds[t.id] || t.status === 'deleted' || t.status === 'completed'}
                          >
                            {cancelingIds[t.id] ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatJson(value?: string | null) {
  if (!value) return '-'
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return JSON.stringify(parsed, null, 2)
  } catch (e) {
    // Not JSON, return as-is
    return String(value)
  }
}

function renderResult(value?: string | null) {
  if (!value) return <div className="text-xs text-gray-500">-</div>
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    // Known cases
    if (parsed.error) {
      return (
        <div className="p-2 rounded bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
          <strong>Error:</strong> {parsed.error}
        </div>
      )
    }
    if (parsed.found !== undefined) {
      return (
        <div className="p-2 rounded bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
          <strong>Found:</strong> {String(parsed.found)}
        </div>
      )
    }
    if (parsed.updated_from !== undefined) {
      return (
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
          <strong>Updated from:</strong> {String(parsed.updated_from)} {parsed.note ? <span className="text-xs text-gray-400 ml-2">• {parsed.note}</span> : null}
        </div>
      )
    }

    // Fallback to preformatted JSON
    return <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto">{JSON.stringify(parsed, null, 2)}</pre>
  } catch (e) {
    return <div className="text-xs">{String(value)}</div>
  }
}
