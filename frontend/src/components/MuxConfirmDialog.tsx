import { X, FileVideo, FileText, ArrowRight, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'

interface MuxPreviewFile {
  video_file: string
  video_size: number
  subtitle_file: string
  subtitle_size: number
  output_file: string
  detected_language?: string
  will_replace_original?: boolean
  ffmpeg_available?: boolean
}

interface MuxPreviewEpisode {
  episode_id: number
  season_number: number
  episode_number: number
  episode_title?: string
  video_file: string
  video_size: number
  video_exists: boolean
  subtitle_file: string
  subtitle_size: number
  subtitle_exists: boolean
  can_mux: boolean
  output_file: string
  detected_language?: string
}

interface MovieMuxPreview extends MuxPreviewFile {
  movie_id: number
  movie_title: string
  movie_year?: number
}

interface TVShowMuxPreview {
  show_id: number
  show_title: string
  total_episodes_with_subtitles: number
  valid_for_muxing: number
  total_video_size: number
  total_subtitle_size: number
  ffmpeg_available: boolean
  episodes: MuxPreviewEpisode[]
}

interface MuxConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isLoading: boolean
  type: 'movie' | 'tvshow'
  preview: unknown | null
  error?: string | null
  progress?: { current: number; total: number } | null
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function MuxConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  type: _type,
  preview,
  error,
  progress
}: MuxConfirmDialogProps) {
  if (!isOpen) return null

  const isMoviePreview = (p: unknown): p is MovieMuxPreview => {
    return typeof p === 'object' && p !== null && 'movie_id' in (p as Record<string, unknown>)
  }

  const isTVShowPreview = (p: unknown): p is TVShowMuxPreview => {
    return typeof p === 'object' && p !== null && 'show_id' in (p as Record<string, unknown>)
  }

  // mark _type as intentionally unused (keeps prop visible for future use)
  if (typeof _type !== 'undefined') void _type

  // Some safety helpers to avoid casting to any in JSX
  const isTvWithMissingFfmpeg = !!preview && isTVShowPreview(preview) && !((preview as TVShowMuxPreview).ffmpeg_available)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            Embed Subtitles Confirmation
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {!preview && !error && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          )}

          {(() => {
            if (isMoviePreview(preview)) {
              const p = preview
              return (
                <div className="space-y-4">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-3">
                      {p.movie_title} {p.movie_year && `(${p.movie_year})`}
                    </h3>
                    
                    <div className="space-y-3">
                      {/* Video file */}
                      <div className="flex items-center gap-3">
                        <FileVideo className="w-5 h-5 text-blue-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm truncate">{p.video_file}</p>
                          <p className="text-gray-500 text-xs">{formatFileSize(p.video_size)}</p>
                        </div>
                      </div>
                      
                      {/* Plus sign */}
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-center text-gray-500">+</span>
                      </div>
                      
                      {/* Subtitle file */}
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-yellow-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm truncate">{p.subtitle_file}</p>
                          <p className="text-gray-500 text-xs">
                            {formatFileSize(p.subtitle_size)}
                            {p.detected_language && ` • Language: ${p.detected_language.toUpperCase()}`}
                          </p>
                        </div>
                      </div>
                      
                      {/* Arrow */}
                      <div className="flex items-center gap-3">
                        <ArrowRight className="w-5 h-5 text-gray-500" />
                      </div>
                      
                      {/* Output file */}
                      <div className="flex items-center gap-3">
                        <FileVideo className="w-5 h-5 text-green-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm truncate">{p.output_file}</p>
                          <p className="text-gray-500 text-xs">MKV container with embedded subtitle</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-300 text-sm">
                      <strong>Warning:</strong> The original video and subtitle files will be deleted after successful embedding.
                    </p>
                  </div>
                </div>
              )
            }
            return null
          })()}

          {(() => {
            if (isTVShowPreview(preview)) {
              const p = preview as TVShowMuxPreview
              return (
                <div className="space-y-4">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-2">{p.show_title}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Episodes with subtitles:</span>
                        <span className="text-white ml-2">{p.total_episodes_with_subtitles}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Ready to mux:</span>
                        <span className="text-green-400 ml-2">{p.valid_for_muxing}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total video size:</span>
                        <span className="text-white ml-2">{formatFileSize(p.total_video_size)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total subtitle size:</span>
                        <span className="text-white ml-2">{formatFileSize(p.total_subtitle_size)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Episode list */}
                  <div className="bg-gray-700/50 rounded-lg overflow-hidden">
                    <div className="p-3 border-b border-gray-600">
                      <h4 className="text-white text-sm font-medium">Episodes to process</h4>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {p.episodes.map((ep) => (
                        <div
                          key={ep.episode_id}
                          className={`flex items-center gap-3 px-3 py-2 border-b border-gray-600/50 last:border-0 ${
                            ep.can_mux ? 'bg-gray-700/30' : 'bg-red-500/10'
                          }`}
                        >
                          <span className="text-gray-400 text-sm w-16">
                            S{ep.season_number.toString().padStart(2, '0')}E{ep.episode_number.toString().padStart(2, '0')}
                          </span>
                          <span className="flex-1 text-white text-sm truncate">
                            {ep.episode_title || `Episode ${ep.episode_number}`}
                          </span>
                          {ep.can_mux ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <span title="Files missing">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-300 text-sm">
                      <strong>Warning:</strong> Original video and subtitle files will be deleted after successful embedding for each episode.
                    </p>
                  </div>
                </div>
              )
            }
            return null
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          {/* Progress indicator - left side */}
          <div className="text-sm">
            {isLoading && progress && (
              <span className="text-primary-400 font-medium">
                Processing {progress.current} of {progress.total}...
              </span>
            )}
          </div>
          
          {/* Buttons - right side */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading || !preview || isTvWithMissingFfmpeg}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Embed Subtitles'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
