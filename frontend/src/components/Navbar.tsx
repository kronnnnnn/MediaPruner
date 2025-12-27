import { Search, RefreshCw, Bell, Sun, Moon } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import logger from '../services/logger'
import { useNotifications } from '../contexts/NotificationContext'
import { useNavigate } from 'react-router-dom'

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<{ movies: any[]; tvshows: any[] } | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  const { theme, toggleTheme } = useTheme()
  const { notifications, markRead, clearAll } = useNotifications()
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  // Submit global search from navbar by pressing Enter (navigates to Movies page with search param)
  const handleNavbarSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchQuery.trim()
      if (q.length > 0) {
        logger.navigation(`/movies?search=${q}`, 'Navbar Search', 'Navbar')
        navigate(`/movies?search=${encodeURIComponent(q)}`)
      }
    }
  }

  // Debounced suggestions
  const suggestionTimer = useRef<number | null>(null)
  useEffect(() => {
    if (suggestionTimer.current) window.clearTimeout(suggestionTimer.current)
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions(null)
      setShowSuggestions(false)
      return
    }
    suggestionTimer.current = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      try {
        const res = await (await import('../services/api')).searchApi.suggestions(searchQuery)
        setSuggestions(res.data)
        setShowSuggestions(true)
      } catch (e) {
        setSuggestions(null)
      } finally {
        setSuggestionsLoading(false)
      }
    }, 250)

    return () => { if (suggestionTimer.current) window.clearTimeout(suggestionTimer.current) }
  }, [searchQuery])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!dropdownRef.current) return
      if (!dropdownRef.current.contains(e.target as Node)) setShowNotifications(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

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
            <div className="relative">
            <input
              type="text"
              placeholder="Search movies, TV shows..."
              value={searchQuery}
              onKeyDown={handleNavbarSearchKey}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (suggestions) setShowSuggestions(true) }}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />

            {showSuggestions && suggestions && (
              <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50" ref={dropdownRef}>
                <div className="p-2">
                  {suggestionsLoading ? (
                    <div className="text-sm text-gray-500">Searching…</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-gray-400 px-2">Movies</div>
                        <ul>
                          {suggestions.movies.map(m => (
                            <li key={`m-${m.id}`}>
                              <button onClick={() => { logger.navigation(`/movies?open_movie=${m.id}`, 'Navbar search select movie', 'Navbar'); navigate(`/movies?open_movie=${m.id}`, { state: { open_movie: m.id } }); setShowSuggestions(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">{m.title}</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 px-2">TV Shows</div>
                        <ul>
                          {suggestions.tvshows.map(s => (
                            <li key={`s-${s.id}`}>
                              <button onClick={() => { logger.navigation(`/tvshows/${s.id}`, 'Navbar search select tvshow', 'Navbar'); navigate(`/tvshows/${s.id}`); setShowSuggestions(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">{s.title}</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            </div>
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
