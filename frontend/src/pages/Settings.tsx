import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Trash2, Film, Tv, Save, Info, RefreshCw, Loader2, Check, X, FolderOpen, ScrollText, AlertTriangle, AlertCircle, Bug, Search } from 'lucide-react'
import { libraryApi, settingsApi, MediaPath } from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import FolderBrowser from '../components/FolderBrowser'
import MessageModal, { useMessageModal } from '../components/MessageModal'
import { useToast } from '../contexts/ToastContext'
import logger from '../services/logger'
import { errorDetail } from '../services/errorUtils'

// Helper function to render TMDB API status indicator
const getTmdbStatusIndicator = (
  tmdbStatusLoading: boolean,
  tmdbConfigured: boolean | undefined
): JSX.Element => {
  if (tmdbStatusLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
  }
  if (tmdbConfigured) {
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <Check className="w-4 h-4" />
        Configured
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-sm">
      <X className="w-4 h-4" />
      Not configured
    </span>
  )
}

// Helper function to render OMDb API status indicator
const getOmdbStatusIndicator = (
  omdbStatusLoading: boolean,
  omdbConfigured: boolean | undefined
): JSX.Element => {
  if (omdbStatusLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
  }
  if (omdbConfigured) {
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <Check className="w-4 h-4" />
        Configured
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-sm">
      <X className="w-4 h-4" />
      Not configured (optional)
    </span>
  )
}

// Helper function to render Tautulli status indicator
const getTautulliStatusIndicator = (
  tautulliStatusLoading: boolean,
  tautulliConfigured: boolean | undefined
): JSX.Element => {
  if (tautulliStatusLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
  }
  if (tautulliConfigured) {
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <Check className="w-4 h-4" />
        Configured
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-sm">
      <X className="w-4 h-4" />
      Not configured (optional)
    </span>
  )
}

// Helper function to render Plex status indicator
const getPlexStatusIndicator = (
  plexStatusLoading: boolean,
  plexConfigured: boolean | undefined
): JSX.Element => {
  if (plexStatusLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
  }
  if (plexConfigured) {
    return (
      <span className="flex items-center gap-1 text-green-400 text-sm">
        <Check className="w-4 h-4" />
        Configured
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-sm">
      <X className="w-4 h-4" />
      Not configured (optional)
    </span>
  )
}

type SettingsTab = 'library' | 'api' | 'logs'

export default function Settings() {
  const queryClient = useQueryClient()
  const { messageState, hideMessage } = useMessageModal()
  const { showToast } = useToast()

  // Log page view on mount
  useEffect(() => {
    logger.pageView('Settings')
  }, [])

  const [activeTab, setActiveTab] = useState<SettingsTab>('library')
  const [newPath, setNewPath] = useState('')
  const [newPathType, setNewPathType] = useState<'movie' | 'tv'>('movie')
  const [newPathName, setNewPathName] = useState('')
  const [scanningPathId, setScanningPathId] = useState<number | null>(null)
  const [pathToDelete, setPathToDelete] = useState<MediaPath | null>(null)
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  
  // TMDB API Key state
  const [tmdbApiKey, setTmdbApiKey] = useState('')
  const [tmdbSaveMessage, setTmdbSaveMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tmdbTestMessage, setTmdbTestMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // OMDb API Key state
  const [omdbApiKey, setOmdbApiKey] = useState('')
  const [omdbSaveMessage, setOmdbSaveMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [omdbTestMessage, setOmdbTestMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Tautulli state
  const [tautulliHost, setTautulliHost] = useState('')
  const [tautulliApiKey, setTautulliApiKey] = useState('')
  const [tautulliSaveMessage, setTautulliSaveMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tautulliTestMessage, setTautulliTestMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  // Plex state
  const [plexHost, setPlexHost] = useState('')
  const [plexToken, setPlexToken] = useState('')
  const [plexSaveMessage, setPlexSaveMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testPlexMessage, setTestPlexMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Logs state
  const [logPage, setLogPage] = useState(1)
  const [logLevel, setLogLevel] = useState<string>('')
  const [logSearch, setLogSearch] = useState('')
  const [logSearchInput, setLogSearchInput] = useState('')

  const { data: paths, isLoading, isError } = useQuery({
    queryKey: ['library-paths'],
    queryFn: () => libraryApi.getPaths().then(res => res.data),
  })

  // Query TMDB API key status
  const { data: tmdbStatus, isLoading: tmdbStatusLoading } = useQuery({
    queryKey: ['tmdb-status'],
    queryFn: () => settingsApi.getTmdbKeyStatus().then(res => res.data),
  })

  // Query OMDb API key status
  const { data: omdbStatus, isLoading: omdbStatusLoading } = useQuery({
    queryKey: ['omdb-status'],
    queryFn: () => settingsApi.getOmdbKeyStatus().then(res => res.data),
  })

  // Query Tautulli status
  const { data: tautulliStatus, isLoading: tautulliStatusLoading } = useQuery({
    queryKey: ['tautulli-status'],
    queryFn: () => settingsApi.getTautulliStatus().then(res => res.data),
  })

  // Query Plex status
  const { data: plexStatus, isLoading: plexStatusLoading } = useQuery({
    queryKey: ['plex-status'],
    queryFn: () => settingsApi.getPlexStatus().then(res => res.data),
  })

  const scanPathMutation = useMutation({
    mutationFn: (pathId: number) => libraryApi.scanPath(pathId),
    onSuccess: async (data) => {
      setScanningPathId(null)
      await queryClient.invalidateQueries({ queryKey: ['library-paths'] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      // Show success message
      const result = data.data
      showToast(
        'Scan Complete',
        `Found ${result.movies_found} movies, ${result.tvshows_found} TV shows, ${result.episodes_found} episodes.`,
        'success'
      )
    },
    onError: () => {
      setScanningPathId(null)
    }
  })

  const addPathMutation = useMutation({
    mutationFn: () => libraryApi.addPath(newPath, newPathType, newPathName || undefined),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['library-paths'] })
      setNewPath('')
      setNewPathName('')
      // Automatically trigger scan after adding path
      const newPathData = data.data as MediaPath
      setScanningPathId(newPathData.id)
      scanPathMutation.mutate(newPathData.id)
    },
  })

  const removePathMutation = useMutation({
    mutationFn: (pathId: number) => libraryApi.removePath(pathId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['library-paths'] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
    },
    onError: (error: unknown) => {
      console.error('Remove path error:', error)
      showToast('Error', errorDetail(error) || 'Failed to remove path', 'error')
    },
  })

  // TMDB API key mutation
  const saveTmdbKeyMutation = useMutation({
    mutationFn: (apiKey: string) => settingsApi.setTmdbApiKey(apiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
      setTmdbApiKey('')
      setTmdbSaveMessage({ type: 'success', message: 'TMDB API key saved successfully!' })
      setTimeout(() => setTmdbSaveMessage(null), 3000)
    },
    onError: () => {
      setTmdbSaveMessage({ type: 'error', message: 'Failed to save TMDB API key' })
      setTimeout(() => setTmdbSaveMessage(null), 3000)
    },
  })

  const deleteTmdbKeyMutation = useMutation({
    mutationFn: () => settingsApi.deleteTmdbApiKey(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
      setTmdbSaveMessage({ type: 'success', message: 'TMDB API key removed' })
      setTimeout(() => setTmdbSaveMessage(null), 3000)
    },
  })

  const verifyTmdbKeyMutation = useMutation({
    mutationFn: (apiKey: string) => settingsApi.verifyTmdbApiKey(apiKey),
    onSuccess: (response) => {
      if (response.data.valid) {
        setTmdbTestMessage({ type: 'success', message: 'API key is valid!' })
      } else {
        setTmdbTestMessage({ type: 'error', message: 'API key is invalid' })
      }
      setTimeout(() => setTmdbTestMessage(null), 3000)
    },
    onError: () => {
      setTmdbTestMessage({ type: 'error', message: 'Failed to verify API key' })
      setTimeout(() => setTmdbTestMessage(null), 3000)
    },
  })

  // OMDb API key mutations
  const saveOmdbKeyMutation = useMutation({
    mutationFn: (apiKey: string) => settingsApi.setOmdbApiKey(apiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['omdb-status'] })
      setOmdbApiKey('')
      setOmdbSaveMessage({ type: 'success', message: 'OMDb API key saved successfully!' })
      setTimeout(() => setOmdbSaveMessage(null), 3000)
    },
    onError: () => {
      setOmdbSaveMessage({ type: 'error', message: 'Failed to save OMDb API key' })
      setTimeout(() => setOmdbSaveMessage(null), 3000)
    },
  })

  const deleteOmdbKeyMutation = useMutation({
    mutationFn: () => settingsApi.deleteOmdbApiKey(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['omdb-status'] })
      setOmdbSaveMessage({ type: 'success', message: 'OMDb API key removed' })
      setTimeout(() => setOmdbSaveMessage(null), 3000)
    },
  })

  const verifyOmdbKeyMutation = useMutation({
    mutationFn: (apiKey: string) => settingsApi.verifyOmdbApiKey(apiKey),
    onSuccess: (response) => {
      if (response.data.valid) {
        setOmdbTestMessage({ type: 'success', message: 'API key is valid!' })
      } else {
        setOmdbTestMessage({ type: 'error', message: 'API key is invalid' })
      }
      setTimeout(() => setOmdbTestMessage(null), 3000)
    },
    onError: () => {
      setOmdbTestMessage({ type: 'error', message: 'Failed to verify API key' })
      setTimeout(() => setOmdbTestMessage(null), 3000)
    },
  })

  // Tautulli mutations
  const saveTautulliMutation = useMutation({
    mutationFn: (data: { host: string; apiKey: string }) => settingsApi.setTautulliSettings(data.host, data.apiKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tautulli-status'] })
      setTautulliHost('')
      setTautulliApiKey('')
      setTautulliSaveMessage({ type: 'success', message: 'Tautulli settings saved successfully!' })
      setTimeout(() => setTautulliSaveMessage(null), 3000)
    },
    onError: () => {
      setTautulliSaveMessage({ type: 'error', message: 'Failed to save Tautulli settings' })
      setTimeout(() => setTautulliSaveMessage(null), 3000)
    },
  })

  // Plex mutations
  const savePlexMutation = useMutation({
    mutationFn: (data: { host: string; token: string }) => settingsApi.setPlexSettings(data.host, data.token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plex-status'] })
      setPlexHost('')
      setPlexToken('')
      setPlexSaveMessage({ type: 'success', message: 'Plex settings saved successfully!' })
      setTimeout(() => setPlexSaveMessage(null), 3000)
    },
    onError: () => {
      setPlexSaveMessage({ type: 'error', message: 'Failed to save Plex settings' })
      setTimeout(() => setPlexSaveMessage(null), 3000)
    },
  })

  const deletePlexMutation = useMutation({
    mutationFn: () => settingsApi.deletePlexSettings(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plex-status'] })
      setPlexSaveMessage({ type: 'success', message: 'Plex settings removed' })
      setTimeout(() => setPlexSaveMessage(null), 3000)
    },
  })

  const deleteTautulliMutation = useMutation({
    mutationFn: () => settingsApi.deleteTautulliSettings(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tautulli-status'] })
      setTautulliSaveMessage({ type: 'success', message: 'Tautulli settings removed' })
      setTimeout(() => setTautulliSaveMessage(null), 3000)
    },
  })

  const verifyTautulliMutation = useMutation({
    mutationFn: ({ host, apiKey }: { host: string; apiKey: string }) => settingsApi.verifyTautulliSettings(host, apiKey),
    onSuccess: (response) => {
      if (response.data.valid) {
        setTautulliTestMessage({ type: 'success', message: 'Connection successful!' })
      } else {
        setTautulliTestMessage({ type: 'error', message: 'Connection failed - check host and API key' })
      }
      setTimeout(() => setTautulliTestMessage(null), 3000)
    },
    onError: () => {
      setTautulliTestMessage({ type: 'error', message: 'Failed to verify connection' })
      setTimeout(() => setTautulliTestMessage(null), 3000)
    },
  })

  // Logs queries
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['logs', logPage, logLevel, logSearch],
    queryFn: () => settingsApi.getLogs({
      page: logPage,
      page_size: 100,
      level: logLevel || undefined,
      search: logSearch || undefined,
    }).then(res => res.data),
    enabled: activeTab === 'logs',
  })

  const { data: logStats, refetch: refetchLogStats } = useQuery({
    queryKey: ['log-stats'],
    queryFn: () => settingsApi.getLogStats().then(res => res.data),
    enabled: activeTab === 'logs',
  })

  const clearLogsMutation = useMutation({
    mutationFn: (level?: string) => settingsApi.clearLogs(level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['log-stats'] })
      showToast('Logs Cleared', 'Application logs have been cleared.', 'success')
    },
  })

  const handleAddPath = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPath.trim()) {
      logger.buttonClick('Add Path', 'Settings', { path: newPath, type: newPathType })
      addPathMutation.mutate()
    }
  }

  const handleScanPath = (pathId: number) => {
    logger.buttonClick('Scan Path', 'Settings', { pathId })
    setScanningPathId(pathId)
    scanPathMutation.mutate(pathId)
  }

  const handleRemovePath = (path: MediaPath) => {
    logger.buttonClick('Remove Path', 'Settings', { pathId: path.id, pathName: path.name })
    setPathToDelete(path)
  }

  const confirmRemovePath = () => {
    if (pathToDelete) {
      logger.dataOperation('delete_path', pathToDelete.name, 'Settings')
      removePathMutation.mutate(pathToDelete.id)
      setPathToDelete(null)
    }
  }

  const handleSaveTmdbKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (tmdbApiKey.trim()) {
      logger.buttonClick('Save TMDB API Key', 'Settings')
      saveTmdbKeyMutation.mutate(tmdbApiKey.trim())
    }
  }

  const handleSaveOmdbKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (omdbApiKey.trim()) {
      logger.buttonClick('Save OMDb API Key', 'Settings')
      saveOmdbKeyMutation.mutate(omdbApiKey.trim())
    }
  }

  const handleSaveTautulli = (e: React.FormEvent) => {
    e.preventDefault()
    if (tautulliHost.trim() && tautulliApiKey.trim()) {
      logger.buttonClick('Save Tautulli Settings', 'Settings')
      saveTautulliMutation.mutate({ host: tautulliHost.trim(), apiKey: tautulliApiKey.trim() })
    }
  }

  const handleSavePlex = (e: React.FormEvent) => {
    e.preventDefault()
    if (plexHost.trim() && plexToken.trim()) {
      logger.buttonClick('Save Plex Settings', 'Settings')
      savePlexMutation.mutate({ host: plexHost.trim(), token: plexToken.trim() })
    }
  }
  const testPlexMutation = useMutation({
    mutationFn: (data: { host: string; token: string }) => settingsApi.testPlexSettings(data.host, data.token),
    onSuccess: () => {
      setTestPlexMessage({ type: 'success', message: 'Plex token validated successfully' })
    },
    onError: (err: unknown) => {
      setTestPlexMessage({ type: 'error', message: errorDetail(err) || 'Failed to validate Plex token' })
    }
  })

  const handleLogSearch = (e: React.FormEvent) => {
    e.preventDefault()
    logger.search(logSearchInput, 'Settings/Logs')
    setLogSearch(logSearchInput)
    setLogPage(1)
  }

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'DEBUG': return 'text-gray-400 bg-gray-700'
      case 'INFO': return 'text-blue-400 bg-blue-900/30'
      case 'WARNING': return 'text-yellow-400 bg-yellow-900/30'
      case 'ERROR': return 'text-red-400 bg-red-900/30'
      case 'CRITICAL': return 'text-red-500 bg-red-900/50'
      default: return 'text-gray-400 bg-gray-700'
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level.toUpperCase()) {
      case 'DEBUG': return <Bug className="w-4 h-4" />
      case 'INFO': return <Info className="w-4 h-4" />
      case 'WARNING': return <AlertTriangle className="w-4 h-4" />
      case 'ERROR': return <AlertCircle className="w-4 h-4" />
      case 'CRITICAL': return <AlertCircle className="w-4 h-4" />
      default: return <Info className="w-4 h-4" />
    }
  }

  // Render function for add path button text
  const renderAddPathButtonText = () => {
    if (addPathMutation.isPending) return 'Adding...'
    if (scanPathMutation.isPending) return 'Scanning...'
    return 'Add Path & Scan'
  }

  // Render function for library paths list
  const renderLibraryPaths = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          <span className="ml-3 text-gray-500 dark:text-gray-400">Loading library paths...</span>
        </div>
      )
    }

    if (isError) {
      return (
        <div className="text-center py-8 text-red-400">
          <p>Failed to load library paths</p>
          <p className="text-sm mt-1">Make sure the backend server is running</p>
        </div>
      )
    }

    if (paths && paths.length > 0) {
      return (
        <div className="space-y-3">
          {paths.map((path) => (
            <div key={path.id} className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${path.media_type === 'movie' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                  {path.media_type === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">{path.name}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-mono">{path.path}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-white">{path.file_count} files</p>
                  <p className={`text-sm ${path.exists ? 'text-green-400' : 'text-red-400'}`}>
                    {path.exists ? 'Available' : 'Not found'}
                  </p>
                </div>
                <button
                  onClick={() => handleScanPath(path.id)}
                  disabled={scanningPathId === path.id}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary-400 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                  title="Scan this folder"
                >
                  {scanningPathId === path.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => handleRemovePath(path)}
                  disabled={removePathMutation.isPending || scanningPathId === path.id}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove path"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <FolderPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No library paths configured</p>
        <p className="text-sm mt-1">Add a folder path above to get started</p>
      </div>
    )
  }

  // Render function for log entries
  const renderLogEntries = () => {
    if (logsLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <span className="ml-3 text-gray-400">Loading logs...</span>
        </div>
      )
    }

    if (logsData?.logs && logsData.logs.length > 0) {
      return logsData.logs.map((log) => (
        <div key={log.id} className="p-4 hover:bg-gray-750">
          <div className="flex items-start gap-3">
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getLevelColor(log.level)}`}>
              {getLevelIcon(log.level)}
              {log.level}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white break-words">{log.message}</p>
              <div className="flex flex-wrap gap-4 mt-1 text-xs text-gray-500">
                <span>{new Date(log.timestamp).toLocaleString()}</span>
                <span>{log.logger_name}</span>
                {log.module && log.function && (
                  <span>{log.module}.{log.function}:{log.line_number}</span>
                )}
              </div>
              {log.exception && (
                <pre className="mt-2 p-2 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-300 overflow-x-auto whitespace-pre-wrap">
                  {log.exception}
                </pre>
              )}
            </div>
          </div>
        </div>
      ))
    }

    return (
      <div className="text-center py-8 text-gray-500">
        <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No logs found</p>
        <p className="text-sm mt-1">Logs will appear here when the application generates them</p>
      </div>
    )
  }

  return (
    <div className="w-[80%] max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => {
              logger.tabChange('Library', 'Settings')
              setActiveTab('library')
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'library'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Library
            </div>
          </button>
          <button
            onClick={() => {
              logger.tabChange('API Keys', 'Settings')
              setActiveTab('api')
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'api'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              API Keys
            </div>
          </button>
          <button
            onClick={() => {
              logger.tabChange('Logs', 'Settings')
              setActiveTab('logs')
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Logs
              {logStats && logStats.error + logStats.warning > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">
                  {logStats.error + logStats.warning}
                </span>
              )}
            </div>
          </button>
        </nav>
      </div>

      {/* Library Tab */}
      {activeTab === 'library' && (
      <div className="bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-white">Library Paths</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Configure folders where your media files are stored
          </p>
        </div>
        
        {/* Add New Path Form */}
        <form onSubmit={handleAddPath} className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-750">
          {/* Path Examples Helper */}
          <div className="mb-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p className="font-medium text-gray-300 mb-1">Enter the full path to your media folder:</p>
                <ul className="space-y-0.5">
                  <li>• Windows: <code className="bg-gray-600 px-1 rounded">C:\Media\Movies</code> or <code className="bg-gray-600 px-1 rounded">D:\Videos\TV Shows</code></li>
                  <li>• Network share: <code className="bg-gray-600 px-1 rounded">\\server\media\movies</code> or <code className="bg-gray-600 px-1 rounded">\\NAS\Videos</code></li>
                  <li>• Linux/Docker: <code className="bg-gray-600 px-1 rounded">/media/movies</code> or <code className="bg-gray-600 px-1 rounded">/mnt/storage/tv</code></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Folder Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="\\server\media\movies or /media/movies"
                  className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowFolderBrowser(true)}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                  title="Browse folders"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="lg:col-span-3">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <select
                value={newPathType}
                onChange={(e) => setNewPathType(e.target.value as 'movie' | 'tv')}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
              >
                <option value="movie">Movies</option>
                <option value="tv">TV Shows</option>
              </select>
            </div>
            <div className="lg:col-span-4">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Name (optional)</label>
              <input
                type="text"
                value={newPathName}
                onChange={(e) => setNewPathName(e.target.value)}
                placeholder="My Movies"
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!newPath.trim() || addPathMutation.isPending || scanPathMutation.isPending}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
          >
            {addPathMutation.isPending || scanPathMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderPlus className="w-4 h-4" />
            )}
            {renderAddPathButtonText()}
          </button>
          {addPathMutation.isError && (
            <p className="mt-2 text-red-400 text-sm">
              Failed to add path. Make sure the directory exists and is accessible.
            </p>
          )}
        </form>

        {/* Existing Paths */}
        <div className="p-4">
          {renderLibraryPaths()}
        </div>
      </div>
    )}

      {/* API Settings Tab */}
      {activeTab === 'api' && (
      <div className="bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-white">API Configuration</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Configure API keys for metadata scraping
          </p>
        </div>
        <div className="p-4 space-y-4">
          {/* Current Status */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-500 dark:text-gray-400 text-sm">TMDB API Status:</span>
            {getTmdbStatusIndicator(tmdbStatusLoading, tmdbStatus?.configured)}
          </div>

          <form onSubmit={handleSaveTmdbKey}>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                {tmdbStatus?.configured ? 'Update TMDB API Key' : 'TMDB API Key'}
              </label>
              <input
                type="password"
                value={tmdbApiKey}
                onChange={(e) => setTmdbApiKey(e.target.value)}
                placeholder={tmdbStatus?.configured ? 'Enter new API key to update' : 'Enter your TMDB API key'}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                Get your API key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">themoviedb.org</a>
              </p>
            </div>
            
            {/* Success/Error Message */}
            {tmdbSaveMessage && (
              <div className={`mt-2 text-sm ${tmdbSaveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {tmdbSaveMessage.message}
              </div>
            )}
            {tmdbTestMessage && (
              <div className={`mt-2 text-sm ${tmdbTestMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {tmdbTestMessage.message}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={!tmdbApiKey.trim() || saveTmdbKeyMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {saveTmdbKeyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saveTmdbKeyMutation.isPending ? 'Saving...' : 'Save API Key'}
              </button>
              
              <button
                type="button"
                onClick={() => verifyTmdbKeyMutation.mutate(tmdbApiKey)}
                disabled={!tmdbApiKey.trim() || verifyTmdbKeyMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {verifyTmdbKeyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {verifyTmdbKeyMutation.isPending ? 'Testing...' : 'Test API Key'}
              </button>
              
              {tmdbStatus?.configured && (
                <button
                  type="button"
                  onClick={() => deleteTmdbKeyMutation.mutate()}
                  disabled={deleteTmdbKeyMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {deleteTmdbKeyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remove Key
                </button>
              )}
            </div>
          </form>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

          {/* OMDb API Key Section */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-500 dark:text-gray-400 text-sm">OMDb API Status:</span>
            {getOmdbStatusIndicator(omdbStatusLoading, omdbStatus?.configured)}
          </div>

          <form onSubmit={handleSaveOmdbKey}>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                {omdbStatus?.configured ? 'Update OMDb API Key' : 'OMDb API Key'}
              </label>
              <input
                type="password"
                value={omdbApiKey}
                onChange={(e) => setOmdbApiKey(e.target.value)}
                placeholder={omdbStatus?.configured ? 'Enter new API key to update' : 'Enter your OMDb API key'}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                <span className="text-gray-500 dark:text-gray-400">Optional:</span> Get a free API key from <a href="http://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">omdbapi.com</a> (1,000 requests/day free).
                <br />
                <span className="text-gray-500 dark:text-gray-400">Provides:</span> IMDB ratings, Rotten Tomatoes scores, and Metacritic scores.
              </p>
            </div>
            
            {/* Success/Error Message */}
            {omdbSaveMessage && (
              <div className={`mt-2 text-sm ${omdbSaveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {omdbSaveMessage.message}
              </div>
            )}
            {omdbTestMessage && (
              <div className={`mt-2 text-sm ${omdbTestMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {omdbTestMessage.message}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={!omdbApiKey.trim() || saveOmdbKeyMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {saveOmdbKeyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saveOmdbKeyMutation.isPending ? 'Saving...' : 'Save API Key'}
              </button>
              
              <button
                type="button"
                onClick={() => verifyOmdbKeyMutation.mutate(omdbApiKey)}
                disabled={!omdbApiKey.trim() || verifyOmdbKeyMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {verifyOmdbKeyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {verifyOmdbKeyMutation.isPending ? 'Testing...' : 'Test API Key'}
              </button>
              
              {omdbStatus?.configured && (
                <button
                  type="button"
                  onClick={() => deleteOmdbKeyMutation.mutate()}
                  disabled={deleteOmdbKeyMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {deleteOmdbKeyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remove Key
                </button>
              )}
            </div>
          </form>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

          {/* Tautulli Integration Section */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-500 dark:text-gray-400 text-sm">Tautulli Status:</span>
            {getTautulliStatusIndicator(tautulliStatusLoading, tautulliStatus?.configured)}
          </div>

          <form onSubmit={handleSaveTautulli}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Tautulli Host URL
                </label>
                <input
                  type="text"
                  value={tautulliHost}
                  onChange={(e) => setTautulliHost(e.target.value)}
                  placeholder={tautulliStatus?.host || 'http://localhost:8181'}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {tautulliStatus?.configured ? 'Update Tautulli API Key' : 'Tautulli API Key'}
                </label>
                <input
                  type="password"
                  value={tautulliApiKey}
                  onChange={(e) => setTautulliApiKey(e.target.value)}
                  placeholder={tautulliStatus?.configured ? 'Enter new API key to update' : 'Enter your Tautulli API key'}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
                <p className="text-gray-500 text-xs mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Optional:</span> Connect to Tautulli for Plex watch history tracking.
                  <br />
                  Find your API key in Tautulli: Settings → Web Interface → API Key
                </p>
              </div>
            </div>
            
            {/* Success/Error Message */}
            {tautulliSaveMessage && (
              <div className={`mt-2 text-sm ${tautulliSaveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {tautulliSaveMessage.message}
              </div>
            )}
            {tautulliTestMessage && (
              <div className={`mt-2 text-sm ${tautulliTestMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {tautulliTestMessage.message}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={!tautulliHost.trim() || !tautulliApiKey.trim() || saveTautulliMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {saveTautulliMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saveTautulliMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
              
              <button
                type="button"
                onClick={() => verifyTautulliMutation.mutate({ host: tautulliHost, apiKey: tautulliApiKey })}
                disabled={!tautulliHost.trim() || !tautulliApiKey.trim() || verifyTautulliMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {verifyTautulliMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {verifyTautulliMutation.isPending ? 'Testing...' : 'Test Connection'}
              </button>
              
              {tautulliStatus?.configured && (
                <button
                  type="button"
                  onClick={() => deleteTautulliMutation.mutate()}
                  disabled={deleteTautulliMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {deleteTautulliMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remove Settings
                </button>
              )}
            </div>
          </form>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

          {/* Plex Integration Section */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-500 dark:text-gray-400 text-sm">Plex Status:</span>
            {getPlexStatusIndicator(plexStatusLoading, plexStatus?.configured)}
          </div>

          <form onSubmit={handleSavePlex}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Plex Host URL</label>
                <input
                  type="text"
                  value={plexHost}
                  onChange={(e) => setPlexHost(e.target.value)}
                  placeholder={plexStatus?.host || 'http://192.168.1.50:32400'}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Plex Token (X-Plex-Token)</label>
                <input
                  type="password"
                  value={plexToken}
                  onChange={(e) => setPlexToken(e.target.value)}
                  placeholder={plexStatus?.configured ? 'Enter new token to update' : 'Enter your Plex X-Plex-Token'}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
                <p className="text-gray-500 text-xs mt-1">Get your token from Plex (account → settings or use developer tools). Used to resolve `rating_key` by GUID.</p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => testPlexMutation.mutate({ host: plexHost.trim(), token: plexToken.trim() })}
                  disabled={!plexHost.trim() || !plexToken.trim() || testPlexMutation.isPending}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {testPlexMutation.isPending ? 'Testing...' : 'Test Token'}
                </button>
                <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noreferrer" className="text-sm text-gray-400 hover:text-white">How to get your token</a>
              </div>

              {testPlexMessage && <div className={`mt-2 text-sm ${testPlexMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{testPlexMessage.message}</div>}
            </div>

            {/* Success/Error Message */}
            {plexSaveMessage && (
              <div className={`mt-2 text-sm ${plexSaveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {plexSaveMessage.message}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={!plexHost.trim() || !plexToken.trim() || savePlexMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                {savePlexMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {savePlexMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>

              {plexStatus?.configured && (
                <button
                  type="button"
                  onClick={() => deletePlexMutation.mutate()}
                  disabled={deletePlexMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  {deletePlexMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remove Settings
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
      <div className="bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Application Logs</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                View application logs and errors
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  refetchLogs()
                  refetchLogStats()
                }}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => clearLogsMutation.mutate(undefined)}
                disabled={clearLogsMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm transition-colors"
              >
                {clearLogsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Log Stats */}
        {logStats && (
          <div className="p-4 border-b border-gray-700 bg-gray-750">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Total:</span>
                <span className="text-white font-medium">{logStats.total}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-blue-900/30 text-blue-400">INFO</span>
                <span className="text-white">{logStats.info}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/30 text-yellow-400">WARNING</span>
                <span className="text-white">{logStats.warning}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-red-900/30 text-red-400">ERROR</span>
                <span className="text-white">{logStats.error}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400">DEBUG</span>
                <span className="text-white">{logStats.debug}</span>
              </div>
            </div>
          </div>
        )}

        {/* Log Filters */}
        <div className="p-4 border-b border-gray-700 bg-gray-750">
          <div className="flex flex-wrap gap-4">
            <form onSubmit={handleLogSearch} className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={logSearchInput}
                  onChange={(e) => setLogSearchInput(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                />
              </div>
            </form>
            <select
              value={logLevel}
              onChange={(e) => {
                setLogLevel(e.target.value)
                setLogPage(1)
              }}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              <option value="">All Levels</option>
              <option value="DEBUG">Debug</option>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="ERROR">Error</option>
              <option value="CRITICAL">Critical</option>
            </select>
            {(logLevel || logSearch) && (
              <button
                onClick={() => {
                  setLogLevel('')
                  setLogSearch('')
                  setLogSearchInput('')
                  setLogPage(1)
                }}
                className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Log Entries */}
        <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
          {renderLogEntries()}
        </div>

        {/* Log Pagination */}
        {logsData && logsData.total_pages > 1 && (
          <div className="p-4 border-t border-gray-700 flex items-center justify-center gap-2">
            <button
              onClick={() => setLogPage(p => Math.max(1, p - 1))}
              disabled={logPage === 1}
              className="px-4 py-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Page {logPage} of {logsData.total_pages}
            </span>
            <button
              onClick={() => setLogPage(p => Math.min(logsData.total_pages, p + 1))}
              disabled={logPage === logsData.total_pages}
              className="px-4 py-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={pathToDelete !== null}
        title="Remove Library Path"
        message={pathToDelete ? `Are you sure you want to remove "${pathToDelete.name || pathToDelete.path}"?\n\nThis will delete all ${pathToDelete.file_count} tracked media entries from the database.` : ''}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmRemovePath}
        onCancel={() => setPathToDelete(null)}
      />

      {/* Folder Browser */}
      <FolderBrowser
        isOpen={showFolderBrowser}
        initialPath={newPath}
        onSelect={(path) => {
          setNewPath(path)
          setShowFolderBrowser(false)
        }}
        onCancel={() => setShowFolderBrowser(false)}
      />

      {/* Message Modal */}
      <MessageModal
        isOpen={messageState.isOpen}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onClose={hideMessage}
      />
    </div>
  )
}

