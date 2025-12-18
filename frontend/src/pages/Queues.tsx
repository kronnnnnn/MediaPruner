import React from 'react'

import React from 'react'
import { useQueues } from '../contexts/QueueContext'

export default function Queues() {
  const { tasks, connected } = useQueues()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Queues</h1>
        <div className={`text-sm ${connected ? 'text-green-600' : 'text-red-500'}`}>{connected ? 'Connected' : 'Disconnected'}</div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-gray-600">No queued tasks</div>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <div key={t.id} className="p-4 border rounded bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold">#{t.id} — {t.type}</div>
                <div className="text-sm text-gray-500">{t.status}</div>
              </div>
              <div className="text-xs text-gray-500 mt-1">Items: {t.total_items} • Completed: {t.completed_items}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
