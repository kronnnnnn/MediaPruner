import { NavLink } from 'react-router-dom'
import { Film, Tv, Settings, LayoutDashboard, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { useSidebar } from '../contexts/SidebarContext'
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

  const handleNavClick = (label: string, path: string) => {
    logger.navigation(path, label, 'Sidebar')
  }

  const handleToggleSidebar = () => {
    logger.uiInteraction('sidebar', isCollapsed ? 'expand' : 'collapse', 'Sidebar')
    toggleSidebar()
  }
  
  return (
    <aside className={`w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src="/MediaPruner.png" alt="MediaPruner" className="w-10 h-10 object-contain" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">MediaPruner</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Media Manager</p>
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
                  `flex items-center ${isCollapsed ? 'justify-center' : ''} gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleToggleSidebar}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
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
