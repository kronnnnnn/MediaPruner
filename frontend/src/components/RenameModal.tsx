import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, FileEdit, FolderEdit, Eye, Check, RefreshCw } from 'lucide-react'
import { moviesApi, Movie } from '../services/api'
import logger from '../services/logger'

interface RenameModalProps {
  movie: Movie
  mode?: 'file' | 'folder'
  onClose: () => void
}

export default function RenameModal({ movie, mode = 'file', onClose }: RenameModalProps) {
  const queryClient = useQueryClient()
  const [selectedPreset, setSelectedPreset] = useState<string>('standard')
  const [customPattern, setCustomPattern] = useState<string>('{title} ({year})')
  const [useCustom, setUseCustom] = useState(false)

  const isFolder = mode === 'folder'
  const Icon = isFolder ? FolderEdit : FileEdit
  const title = isFolder ? 'Rename Folder' : 'Rename Movie'
  const currentLabel = isFolder ? 'Current Folder Name' : 'Current Filename'
  const actionLabel = isFolder ? 'Rename Folder' : 'Rename File'

  // Log modal open on mount
  useEffect(() => {
    logger.modal('open', title, 'RenameModal')
  }, [title])

  // Fetch presets
  const { data: presetsData } = useQuery({
    queryKey: ['rename-presets'],
    queryFn: async () => {
      const response = await moviesApi.getRenamePresets()
      return response.data
    },
  })

  const presets = presetsData?.presets || {}
  const placeholders = presetsData?.placeholders || {}

  // Get current pattern
  const currentPattern = useCustom ? customPattern : (presets[selectedPreset]?.pattern || '{title} ({year})')

  // Preview rename - different API for file vs folder
  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: [isFolder ? 'rename-folder-preview' : 'rename-preview', movie.id, currentPattern],
    queryFn: async () => {
      const response = isFolder 
        ? await moviesApi.previewFolderRename(movie.id, currentPattern)
        : await moviesApi.previewRename(movie.id, currentPattern)
      return response.data
    },
    enabled: !!currentPattern,
  })

  // Rename mutation - different API for file vs folder
  const renameMutation = useMutation({
    mutationFn: () => isFolder 
      ? moviesApi.renameFolder(movie.id, currentPattern)
      : moviesApi.renameMovie(movie.id, currentPattern),
    onSuccess: () => {
      logger.dataOperation('rename', `${isFolder ? 'folder' : 'file'} renamed`, 'RenameModal', { movieId: movie.id, pattern: currentPattern })
      queryClient.invalidateQueries({ queryKey: ['movies'] })
      queryClient.invalidateQueries({ queryKey: ['movie', movie.id] })
      onClose()
    },
  })

  // Refetch preview when pattern changes
  useEffect(() => {
    if (currentPattern) {
      refetchPreview()
    }
  }, [currentPattern, refetchPreview])

  // Get the current name to display
  const getCurrentName = () => {
    if (isFolder && movie.file_path) {
      // Extract folder name from file path
      const parts = movie.file_path.replace(/\\/g, '/').split('/')
      parts.pop() // Remove file name
      return parts.pop() || 'Unknown folder'
    }
    return movie.file_name
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Info */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm text-gray-400 mb-2">{currentLabel}</h3>
            <p className="text-white font-mono text-sm break-all">{preview?.current_name || getCurrentName()}</p>
          </div>

          {/* Detected Release Info */}
          {preview?.parsed_info && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm text-gray-400 mb-3">Detected Release Info</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Quality:</span>
                  <p className="text-white">{preview.parsed_info.quality || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Resolution:</span>
                  <p className="text-white">{preview.parsed_info.resolution || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Edition:</span>
                  <p className="text-white">{preview.parsed_info.edition || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Release Group:</span>
                  <p className="text-white">{preview.parsed_info.release_group || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Preset Selection */}
          <div>
            <h3 className="text-sm text-gray-400 mb-3">Naming Pattern</h3>
            <div className="space-y-2">
              {Object.entries(presets).map(([key, preset]) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    !useCustom && selectedPreset === key
                      ? 'bg-primary-600/20 border border-primary-500'
                      : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={!useCustom && selectedPreset === key}
                    onChange={() => {
                      setUseCustom(false)
                      setSelectedPreset(key)
                    }}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    !useCustom && selectedPreset === key
                      ? 'border-primary-500 bg-primary-500'
                      : 'border-gray-500'
                  }`}>
                    {!useCustom && selectedPreset === key && (
                      <Check className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{preset.name}</p>
                    <p className="text-sm text-gray-400">{preset.description}</p>
                  </div>
                </label>
              ))}

              {/* Custom Pattern */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  useCustom
                    ? 'bg-primary-600/20 border border-primary-500'
                    : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={useCustom}
                  onChange={() => setUseCustom(true)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 mt-1 rounded-full border-2 flex items-center justify-center ${
                  useCustom
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-gray-500'
                }`}>
                  {useCustom && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium mb-2">Custom Pattern</p>
                  <input
                    type="text"
                    value={customPattern}
                    onChange={(e) => setCustomPattern(e.target.value)}
                    onFocus={() => setUseCustom(true)}
                    placeholder="{title} ({year})"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(placeholders).map(([ph, desc]) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => {
                          setUseCustom(true)
                          setCustomPattern(prev => prev + ph)
                        }}
                        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 font-mono"
                        title={desc}
                      >
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-gray-400 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </h3>
              {previewLoading && (
                <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
            <p className="text-white font-mono text-sm break-all">
              {preview?.new_name || 'Loading...'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => renameMutation.mutate()}
              disabled={renameMutation.isPending || !preview}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <Icon className="w-4 h-4" />
              {renameMutation.isPending ? 'Renaming...' : actionLabel}
            </button>
          </div>

          {renameMutation.isError && (
            <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
              {(renameMutation.error as any)?.response?.data?.detail || `Failed to rename ${isFolder ? 'folder' : 'file'}`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
