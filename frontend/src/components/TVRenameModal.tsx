import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, FileEdit, Eye, Check, RefreshCw, Tv } from 'lucide-react'
import { tvShowsApi, TVShow } from '../services/api'
import logger from '../services/logger'

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  
  return debouncedValue
}

interface TVRenameModalProps {
  show: TVShow
  onClose: () => void
}

export default function TVRenameModal({ show, onClose }: TVRenameModalProps) {
  const queryClient = useQueryClient()
  const [selectedPreset, setSelectedPreset] = useState<string>('standard')
  const [customPattern, setCustomPattern] = useState<string>('{show} - S{season:02d}E{episode:02d} - {title}')
  const [useCustom, setUseCustom] = useState(false)
  const [organizeInSeasonFolder, setOrganizeInSeasonFolder] = useState(true)
  const [spaceReplacement, setSpaceReplacement] = useState<string>('') // '' = None/keep spaces, '.' = period, '_' = underscore, or custom

  // Log modal open on mount
  useEffect(() => {
    logger.modal('open', 'Rename Episodes', 'TVRenameModal')
  }, [])

  // Fetch presets
  const { data: presetsData } = useQuery({
    queryKey: ['tv-rename-presets'],
    queryFn: async () => {
      const response = await tvShowsApi.getRenamePresets()
      return response.data
    },
  })

  const presets = presetsData?.presets || {}
  const placeholders = presetsData?.placeholders || {}

  // Get current pattern
  const currentPattern = useCustom ? customPattern : (presets[selectedPreset]?.pattern || '{show} - S{season:02d}E{episode:02d} - {title}')
  
  // Get space replacement value (null/empty if keeping spaces, otherwise the replacement character)
  const replaceSpacesValue = spaceReplacement && spaceReplacement.length > 0 ? spaceReplacement : null
  
  // Debounce the pattern and space replacement to prevent excessive API calls while typing
  const debouncedPattern = useDebounce(currentPattern, 300)
  const debouncedSpaceReplacement = useDebounce(replaceSpacesValue, 300)

  // Preview rename - uses debounced values to prevent flashing
  const { data: preview, isFetching: previewFetching } = useQuery({
    queryKey: ['tv-rename-preview', show.id, debouncedPattern, debouncedSpaceReplacement],
    queryFn: async () => {
      const response = await tvShowsApi.previewRename(show.id, debouncedPattern, debouncedSpaceReplacement)
      return response.data
    },
    enabled: !!debouncedPattern,
    staleTime: 1000, // Keep data fresh for 1 second to prevent unnecessary refetches
  })

  // Rename mutation
  const renameMutation = useMutation({
    mutationFn: () => tvShowsApi.renameTVShow(show.id, currentPattern, organizeInSeasonFolder, replaceSpacesValue),
    onSuccess: async (result: any) => {
      const data = result.data
      logger.dataOperation('rename', `episodes renamed: ${data.renamed}/${data.total}`, 'TVRenameModal', { 
        showId: show.id, 
        pattern: currentPattern,
        renamed: data.renamed,
        total: data.total,
        errors: data.errors?.length || 0
      })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
      await queryClient.invalidateQueries({ queryKey: ['tvshow', show.id] })
      await queryClient.invalidateQueries({ queryKey: ['episodes', show.id] })
      onClose()
    },
  })

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
            <FileEdit className="w-5 h-5 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">Rename Episodes</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Show Info */}
          <div className="bg-gray-700/50 rounded-lg p-4 flex items-center gap-4">
            {show.poster_path ? (
              <img src={show.poster_path} alt={show.title} className="w-16 h-24 object-cover rounded" />
            ) : (
              <div className="w-16 h-24 bg-gray-600 rounded flex items-center justify-center">
                <Tv className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div>
              <h3 className="text-white font-medium">{show.title}</h3>
              <p className="text-gray-400 text-sm">{show.episode_count} Episodes</p>
            </div>
          </div>

          {/* Rename Preview */}
          <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-gray-400 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Rename Preview
              </h3>
              {previewFetching && (
                <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
            {preview ? (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Current:</p>
                  <p className="text-white font-mono text-sm break-all">{preview.current_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">New:</p>
                  <p className="text-green-400 font-mono text-sm break-all">{preview.new_name}</p>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-sm">Loading preview...</p>
            )}
          </div>

          {/* Detected Release Info */}
          {preview?.parsed_info && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm text-gray-400 mb-3">Detected Release Info</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Quality:</span>
                  <p className="text-white">{preview.parsed_info.quality || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Resolution:</span>
                  <p className="text-white">{preview.parsed_info.resolution || '—'}</p>
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
            <div className="space-y-2 max-h-80 overflow-y-auto">
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
                    placeholder="{show} - S{season:02d}E{episode:02d} - {title}"
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
                  
                  {/* Space Replacement Option */}
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <label className="text-sm text-gray-400 mb-2 block">Replace spaces with:</label>
                    <div className="flex gap-2 items-center flex-wrap">
                      {[
                        { value: '', label: 'None (keep spaces)', display: 'None' },
                        { value: '.', label: 'Period', display: '.' },
                        { value: '_', label: 'Underscore', display: '_' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setUseCustom(true)
                            setSpaceReplacement(option.value)
                          }}
                          className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                            spaceReplacement === option.value
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                          title={option.label}
                        >
                          {option.display}
                        </button>
                      ))}
                      <span className="text-gray-500 text-sm">or</span>
                      <input
                        type="text"
                        value={spaceReplacement === '' || spaceReplacement === '.' || spaceReplacement === '_' ? '' : spaceReplacement}
                        onChange={(e) => {
                          setUseCustom(true)
                          setSpaceReplacement(e.target.value)
                        }}
                        onFocus={() => setUseCustom(true)}
                        placeholder="custom"
                        className="w-20 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                        maxLength={5}
                      />
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Options */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={organizeInSeasonFolder}
                onChange={(e) => setOrganizeInSeasonFolder(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <p className="text-white font-medium">Organize in Season Folders</p>
                <p className="text-sm text-gray-400">Move episodes to Season XX subfolders</p>
              </div>
            </label>
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
              <FileEdit className="w-4 h-4" />
              {renameMutation.isPending ? 'Renaming...' : 'Rename All Episodes'}
            </button>
          </div>

          {renameMutation.isError && (
            <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
              {(renameMutation.error as any)?.response?.data?.detail || 'Failed to rename episodes'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
