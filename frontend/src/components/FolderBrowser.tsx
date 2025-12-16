import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Folder, FolderOpen, ChevronRight, ChevronUp, X, Loader2, HardDrive } from 'lucide-react'
import { libraryApi } from '../services/api'
import logger from '../services/logger'

interface FolderBrowserProps {
  isOpen: boolean
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}

export default function FolderBrowser({ isOpen, initialPath, onSelect, onCancel }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '')
  const [manualPath, setManualPath] = useState('')

  // Log modal open/close
  useEffect(() => {
    if (isOpen) {
      logger.modal('open', 'FolderBrowser', 'FolderBrowser')
    }
  }, [isOpen])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['browse', currentPath],
    queryFn: () => libraryApi.browse(currentPath || undefined).then(res => res.data),
    enabled: isOpen,
  })

  useEffect(() => {
    if (data?.current_path) {
      setManualPath(data.current_path)
    }
  }, [data?.current_path])

  useEffect(() => {
    if (isOpen && initialPath) {
      setCurrentPath(initialPath)
      setManualPath(initialPath)
    }
  }, [isOpen, initialPath])

  if (!isOpen) return null

  const handleNavigate = (path: string) => {
    setCurrentPath(path)
  }

  const handleGoUp = () => {
    if (data?.parent_path) {
      setCurrentPath(data.parent_path)
    } else {
      setCurrentPath('')
    }
  }

  const handleGoToRoot = () => {
    setCurrentPath('')
  }

  const handleManualPathSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualPath.trim()) {
      logger.buttonClick('Navigate to path', 'FolderBrowser', { path: manualPath.trim() })
      setCurrentPath(manualPath.trim())
    }
  }

  const handleSelect = () => {
    if (data?.current_path) {
      logger.buttonClick('Select Folder', 'FolderBrowser', { path: data.current_path })
      logger.modal('close', 'FolderBrowser', 'FolderBrowser')
      onSelect(data.current_path)
    }
  }

  const handleCancel = () => {
    logger.modal('close', 'FolderBrowser', 'FolderBrowser')
    onCancel()
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleCancel}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-semibold text-white">Select Folder</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Path Input */}
        <div className="p-4 border-b border-gray-700">
          <form onSubmit={handleManualPathSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="Enter path (press Enter to navigate)"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary-500 font-mono text-sm"
            />
          </form>
        </div>

        {/* Navigation Bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/50 border-b border-gray-700">
          <button
            onClick={handleGoToRoot}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Go to drives/root"
          >
            <HardDrive className="w-4 h-4" />
          </button>
          <button
            onClick={handleGoUp}
            disabled={!data?.parent_path && !data?.current_path}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go up one level"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div className="flex-1 text-sm text-gray-300 font-mono truncate">
            {data?.current_path || 'Select a drive or enter a network path above (e.g., \\\\server\\share)'}
          </div>
        </div>

        {/* Directory Listing */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              <span className="ml-2 text-gray-400">Loading...</span>
            </div>
          ) : isError ? (
            <div className="p-4 text-center text-red-400">
              <p>Error loading directory</p>
              <p className="text-sm mt-1">{(error as any)?.response?.data?.detail || 'Path not accessible'}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 text-primary-400 hover:text-primary-300"
              >
                Try again
              </button>
            </div>
          ) : data?.items.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No subfolders found</p>
              <p className="text-sm mt-1">You can select this folder or go back</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {data?.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors text-left"
                >
                  <Folder className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  <span className="text-white truncate">{item.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-500 ml-auto flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-900/50">
          <div className="text-sm text-gray-400">
            {data?.current_path ? (
              <span className="font-mono truncate max-w-[300px] inline-block align-bottom">
                {data.current_path}
              </span>
            ) : (
              'Select a folder'
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!data?.current_path}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
