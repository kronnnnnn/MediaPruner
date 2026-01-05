import { NavLink } from 'react-router-dom'
import { Film, Tv, Settings, LayoutDashboard, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { useSidebar } from '../contexts/SidebarContext'
import { useQueues } from '../contexts/QueueContext'
import logger from '../services/logger'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/movies', icon: Film, label: 'Movies' },
  { path: '/tvshows', icon: Tv, label: 'TV' },
  { path: '/queues', icon: List, label: 'Queue' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const queues = (() => {
    try { return useQueues() } catch { return null }
  })()

  // Compute queued items count (remaining items) for display in sidebar when expanded
  let queuedItemsCount = 0
  if (queues && queues.tasks) {
    const current = queues.tasks.filter(t => {
      const s = String(t.status).toLowerCase()
      const hasFailed = Array.isArray(t.items) && t.items.some(i => String((i as { status?: unknown }).status ?? '').toLowerCase() === 'failed')
      if (hasFailed) return false
      return !['completed', 'deleted', 'canceled', 'failed'].includes(s)
    })
    queuedItemsCount = current.reduce((acc, t) => acc + Math.max(0, (t.total_items ?? 0) - (t.completed_items ?? 0)), 0)
  }

  const handleNavClick = (label: string, path: string) => {
    logger.navigation(path, label, 'Sidebar')
  }

  const handleToggleSidebar = () => {
    logger.uiInteraction('sidebar', isCollapsed ? 'expand' : 'collapse', 'Sidebar')
    toggleSidebar()
  }
  
  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
      <div className="py-4 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src="/MediaPruner.png" alt="MediaPruner" className="w-10 h-10 object-contain" />
          </div>
          {!isCollapsed && (
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-5">MediaPruner</h1>
              <p className="text-xxs text-gray-500 dark:text-gray-400 leading-4">Media Manager</p>
            </div>
          )}
        </div>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                onClick={() => handleNavClick(item.label, item.path)}
                className={({ isActive }) =>
                  `h-12 flex items-center ${isCollapsed ? 'justify-center' : ''} gap-3 px-4 rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`
                }
                >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate max-w-[10rem]">{item.label}</span>
                    {item.path === '/queues' && queuedItemsCount > 0 ? (
                      <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded ml-2">{queuedItemsCount}</span>
                    ) : null}
                  </div>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleToggleSidebar}
          className="w-full h-12 flex items-center justify-center gap-2 px-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!isCollapsed && <span className="text-sm">Collapse</span>}
        </button>
        {!isCollapsed && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
            Version 0.1.0
          </div>
        )}
      </div>
    </aside>
  )
}
