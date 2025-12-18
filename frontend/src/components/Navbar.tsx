<<<<<<< HEAD
import { Search, RefreshCw, Bell, Sun, Moon } from 'lucide-react'
=======
import { Search, RefreshCw, Bell, Sun, Moon, X } from 'lucide-react'
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import logger from '../services/logger'
import { useNotifications } from '../contexts/NotificationContext'
<<<<<<< HEAD
import { useNavigate } from 'react-router-dom'
=======
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const { theme, toggleTheme } = useTheme()
  const { notifications, markRead, clearAll } = useNotifications()
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
<<<<<<< HEAD
  const navigate = useNavigate()
=======
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!dropdownRef.current) return
      if (!dropdownRef.current.contains(e.target as Node)) setShowNotifications(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const handleThemeToggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    logger.uiInteraction('theme', `switch to ${newTheme}`, 'Navbar')
    toggleTheme()
  }
  
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 max-w-xl">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search movies, TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button 
            onClick={handleThemeToggle}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh Library"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="relative">
            <button 
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
              title="Notifications"
              onClick={() => setShowNotifications(s => !s)}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
            </button>

            {showNotifications && (
              <div ref={dropdownRef} className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div className="text-sm font-semibold">Notifications</div>
                  <div className="text-xs text-gray-500">
                    <button onClick={() => clearAll()} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">Clear</button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">No notifications</div>
                  ) : notifications.map(n => (
<<<<<<< HEAD
                    <div key={n.id} onClick={() => {
                      markRead(n.id)
                      // If the notification has a task meta, navigate to queues and open it via hash
                      try {
                        if (n.meta && n.meta.task_id) {
                          setShowNotifications(false)
                          navigate(`/queues#task-${n.meta.task_id}`)
                        }
                      } catch (e) {
                        // ignore
                      }
                    }} className={`p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${n.read ? 'opacity-60' : ''}`}>
=======
                    <div key={n.id} onClick={() => { markRead(n.id) }} className={`p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${n.read ? 'opacity-60' : ''}`}>
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</div>
                        <div className="text-xs text-gray-400">{new Date(n.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{n.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
