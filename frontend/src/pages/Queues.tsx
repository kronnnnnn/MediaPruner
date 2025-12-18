
import { useState } from 'react'
import { useQueues } from '../contexts/QueueContext'

export default function Queues() {
  const { tasks, connected } = useQueues()
  const [activeTab, setActiveTab] = useState<'current'|'history'>('current')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const toggle = (id: number) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const currentTasks = tasks.filter(t => !['completed', 'deleted'].includes(String(t.status).toLowerCase()))
  const historyTasks = tasks.filter(t => ['completed', 'deleted', 'failed'].includes(String(t.status).toLowerCase()))

  const renderTask = (t: any) => {
    const isOpen = !!expanded[t.id]

    return (
      <div key={t.id} className="border rounded bg-white dark:bg-gray-800">
        <button onClick={() => toggle(t.id)} className="w-full text-left p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold">#{t.id} — {t.type}</div>
            <div className="text-xs text-gray-500 mt-1">Items: {t.total_items} • Completed: {t.completed_items}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500 capitalize">{t.status}</div>
            <div className="text-xs text-gray-400">{isOpen ? '▾' : '▸'}</div>
          </div>
        </button>
        {isOpen && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="mb-2 text-sm text-gray-400">Task details</div>
            <div className="space-y-2">
              {t.items && t.items.length > 0 ? t.items.map((it: any) => (
                <div key={it.id} className="p-2 rounded bg-white dark:bg-gray-800 border">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Item #{it.index} — {it.status}</div>
                    <div className="text-xs text-gray-400">{it.started_at ? new Date(it.started_at).toLocaleString() : ''}{it.finished_at ? ` — ${new Date(it.finished_at).toLocaleString()}` : ''}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Payload: <code className="break-words">{typeof it.payload === 'string' ? it.payload : JSON.stringify(it.payload)}</code></div>
                  {it.result && <div className="text-xs text-gray-500 mt-1">Result: <code className="break-words">{typeof it.result === 'string' ? it.result : JSON.stringify(it.result)}</code></div>}
                </div>
              )) : (
                <div className="text-sm text-gray-500">No items</div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Queues</h1>
        <div className={`text-sm ${connected ? 'text-green-600' : 'text-red-500'}`}>{connected ? 'Connected' : 'Disconnected'}</div>
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
    </div>
  )
}
