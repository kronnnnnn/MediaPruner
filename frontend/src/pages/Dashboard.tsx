import { useEffect } from 'react'
import { Film, Tv, HardDrive, RefreshCw, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '../services/api'
import logger from '../services/logger'

export default function Dashboard() {
  const queryClient = useQueryClient()

  // Log page view on mount
  useEffect(() => {
    logger.pageView('Dashboard')
  }, [])

  const { data: paths, isLoading: pathsLoading } = useQuery({
    queryKey: ['library-paths'],
    queryFn: () => libraryApi.getPaths().then(res => res.data),
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['library-stats'],
    queryFn: () => libraryApi.getStats().then(res => res.data),
  })

  const scanAllMutation = useMutation({
    mutationFn: () => libraryApi.scanAll(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['library-paths'] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
    },
  })

  const scanPathMutation = useMutation({
    mutationFn: (pathId: number) => libraryApi.scanPath(pathId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['library-paths'] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
    },
  })

  const statCards = [
    { 
      label: 'Movies', 
      value: stats?.movies || 0, 
      icon: Film, 
      color: 'bg-blue-500' 
    },
    { 
      label: 'TV Shows', 
      value: stats?.tvshows || 0, 
      icon: Tv, 
      color: 'bg-purple-500' 
    },
    { 
      label: 'Library Paths', 
      value: paths?.length || 0, 
      icon: HardDrive, 
      color: 'bg-green-500' 
    },
  ]

  const isLoading = pathsLoading || statsLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <button 
          onClick={() => {
            logger.buttonClick('Scan Library', 'Dashboard')
            scanAllMutation.mutate()
          }}
          disabled={scanAllMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          {scanAllMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {scanAllMutation.isPending ? 'Scanning...' : 'Scan Library'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Library Paths */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Library Paths</h2>
        </div>
        <div className="p-4">
          {(() => {
            if (isLoading) return (
              <div className="animate-pulse space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                ))}
              </div>
            )
            if (paths && paths.length > 0) return (
              <div className="space-y-3">
                {paths.map((path) => (
                  <div key={path.id} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${path.media_type === 'movie' ? 'bg-blue-500/20 text-blue-500 dark:text-blue-400' : 'bg-purple-500/20 text-purple-500 dark:text-purple-400'}`}>
                        {path.media_type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-white font-medium">{path.name}</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{path.path}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-gray-900 dark:text-white">{path.file_count} files</p>
                        <p className={`text-sm ${path.exists ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {path.exists ? 'Available' : 'Not found'}
                        </p>
                      </div>
                      <button
                        onClick={() => scanPathMutation.mutate(path.id)}
                        disabled={scanPathMutation.isPending}
                        className="p-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 rounded-lg transition-colors"
                        title="Scan this path"
                      >
                        {scanPathMutation.isPending ? (
                          <Loader2 className="w-4 h-4 text-gray-900 dark:text-white animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 text-gray-900 dark:text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
            return (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No library paths configured</p>
                <p className="text-sm mt-1">Go to Settings to add media folders</p>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => scanAllMutation.mutate()}
            disabled={scanAllMutation.isPending}
            className="p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors text-left"
          >
            {scanAllMutation.isPending ? (
              <Loader2 className="w-6 h-6 text-primary-500 dark:text-primary-400 mb-2 animate-spin" />
            ) : (
              <RefreshCw className="w-6 h-6 text-primary-500 dark:text-primary-400 mb-2" />
            )}
            <p className="text-gray-900 dark:text-white font-medium">Full Scan</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Rescan all libraries</p>
          </button>
          <button className="p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-left">
            <Film className="w-6 h-6 text-blue-500 dark:text-blue-400 mb-2" />
            <p className="text-gray-900 dark:text-white font-medium">Scrape Movies</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Update all metadata</p>
          </button>
          <button className="p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-left">
            <Tv className="w-6 h-6 text-purple-500 dark:text-purple-400 mb-2" />
            <p className="text-gray-900 dark:text-white font-medium">Scrape TV Shows</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Update all metadata</p>
          </button>
          <button className="p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-left">
            <HardDrive className="w-6 h-6 text-green-500 dark:text-green-400 mb-2" />
            <p className="text-gray-900 dark:text-white font-medium">Rename Files</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Apply naming rules</p>
          </button>
        </div>
      </div>
    </div>
  )
}
