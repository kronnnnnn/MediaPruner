import { useState, useEffect } from 'react'
import { X, Edit2, FolderEdit, RefreshCw, FileText, Star, HardDrive, Film, Volume2, Subtitles, Trash2, FileVideo } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { moviesApi, Movie } from '../services/api'
import RenameModal from './RenameModal'
import ConfirmDialog from './ConfirmDialog'
import MuxConfirmDialog from './MuxConfirmDialog'
import logger from '../services/logger'

interface MovieDetailProps {
  movieId: number
  initialMovie?: Movie
  onClose: () => void
  onDeleted?: () => void
}

export default function MovieDetail({ movieId, initialMovie, onClose, onDeleted }: MovieDetailProps) {
  const queryClient = useQueryClient()
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameMode, setRenameMode] = useState<'file' | 'folder'>('file')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteOptions, setDeleteOptions] = useState<{ deleteFile: boolean; deleteFolder: boolean }>({ deleteFile: false, deleteFolder: false })
  const [showMuxConfirm, setShowMuxConfirm] = useState(false)
  const [muxPreview, setMuxPreview] = useState<any>(null)
  const [muxPreviewError, setMuxPreviewError] = useState<string | null>(null)

  // Log modal open on mount
  useEffect(() => {
    logger.modal('open', 'MovieDetail', 'MovieDetail')
    return () => {
      logger.modal('close', 'MovieDetail', 'MovieDetail')
    }
  }, [movieId])

  // Fetch movie data - will refetch when invalidated
  const { data: movie } = useQuery({
    queryKey: ['movie', movieId],
    queryFn: async () => {
      const response = await moviesApi.getMovie(movieId)
      return response.data
    },
    initialData: initialMovie,
    staleTime: 0, // Always refetch when invalidated
  })

  const scrapeMutation = useMutation({
    mutationFn: () => moviesApi.scrapeMovie(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: () => moviesApi.analyzeMovie(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
    },
  })

  const nfoMutation = useMutation({
    mutationFn: () => moviesApi.generateNfo(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (options: { deleteFile: boolean; deleteFolder: boolean }) => 
      moviesApi.deleteMovie(movieId, options),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      onClose()
      onDeleted?.()
    },
  })

  const muxSubtitleMutation = useMutation({
    mutationFn: () => moviesApi.muxSubtitle(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      setShowMuxConfirm(false)
      setMuxPreview(null)
    },
    onError: (error: any) => {
      setMuxPreviewError(error?.response?.data?.detail || 'Failed to embed subtitle')
    }
  })

  const handleMuxSubtitle = async () => {
    logger.buttonClick('Embed Subtitle', 'MovieDetail', { movieId })
    setMuxPreview(null)
    setMuxPreviewError(null)
    setShowMuxConfirm(true)
    
    try {
      const response = await moviesApi.getMuxSubtitlePreview(movieId)
      setMuxPreview(response.data)
    } catch (error: any) {
      setMuxPreviewError(error?.response?.data?.detail || 'Failed to get preview')
    }
  }

  const confirmMuxSubtitle = () => {
    muxSubtitleMutation.mutate()
  }

  const handleDeleteClick = (deleteFile: boolean, deleteFolder: boolean) => {
    const deleteType = deleteFolder ? 'folder' : deleteFile ? 'file' : 'library'
    logger.buttonClick(`Delete (${deleteType})`, 'MovieDetail', { movieId, deleteFile, deleteFolder })
    setDeleteOptions({ deleteFile, deleteFolder })
    setShowDeleteConfirm(true)
  }

  const handleScrape = () => {
    logger.buttonClick('Refresh Metadata', 'MovieDetail', { movieId })
    scrapeMutation.mutate()
  }

  const handleAnalyze = () => {
    logger.buttonClick('Analyze File', 'MovieDetail', { movieId })
    analyzeMutation.mutate()
  }

  const handleRenameFile = () => {
    logger.buttonClick('Rename File', 'MovieDetail', { movieId })
    setRenameMode('file')
    setShowRenameModal(true)
  }

  const handleRenameFolder = () => {
    logger.buttonClick('Rename Folder', 'MovieDetail', { movieId })
    setRenameMode('folder')
    setShowRenameModal(true)
  }

  const handleGenerateNfo = () => {
    logger.buttonClick('Generate NFO', 'MovieDetail', { movieId })
    nfoMutation.mutate()
  }

  const handleCloseRenameModal = () => {
    logger.modal('close', 'RenameModal', 'MovieDetail')
    setShowRenameModal(false)
  }

  const confirmDelete = () => {
    deleteMutation.mutate(deleteOptions)
    setShowDeleteConfirm(false)
  }

  // Show loading state if no data yet
  if (!movie) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="p-8 bg-white dark:bg-gray-800 rounded-lg">
          <RefreshCw className="w-8 h-8 text-gray-900 dark:text-white animate-spin" />
        </div>
      </div>
    )
  }

  const genres = movie.genres ? movie.genres.split(',').map(g => g.trim()) : []
  
  // Parse audio tracks JSON if available
  const audioTracks = movie.audio_tracks ? JSON.parse(movie.audio_tracks) : []
  const subtitleLanguages = movie.subtitle_languages ? JSON.parse(movie.subtitle_languages) : []

  // Format duration from seconds to HH:MM:SS
  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`
    }
    return `${mins}m ${secs}s`
  }

  // Format bitrate
  const formatBitrate = (kbps?: number) => {
    if (!kbps) return null
    if (kbps >= 1000) {
      return `${(kbps / 1000).toFixed(1)} Mbps`
    }
    return `${kbps} kbps`
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Backdrop */}
        {movie.backdrop_path && (
          <div className="relative h-64 overflow-hidden rounded-t-lg">
            <img
              src={movie.backdrop_path}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-gray-800 to-transparent" />
          </div>
        )}

        {/* Content */}
        <div className="p-6 -mt-20 relative">
          <div className="flex gap-6">
            {/* Poster */}
            <div className="flex-shrink-0">
              {movie.poster_path ? (
                <img
                  src={movie.poster_path}
                  alt={movie.title}
                  className="w-40 h-60 object-cover rounded-lg shadow-lg"
                />
              ) : (
                <div className="w-40 h-60 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-4xl">🎬</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{movie.title}</h2>
              {movie.original_title && movie.original_title !== movie.title && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{movie.original_title}</p>
              )}
              
              <div className="flex items-center gap-4 mt-2 text-gray-500 dark:text-gray-400 text-sm">
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && <span>{movie.runtime} min</span>}
              </div>

              {/* Ratings Section */}
              {(movie.rating || movie.imdb_rating || movie.rotten_tomatoes_score !== undefined || movie.metacritic_score !== undefined) && (
                <div className="flex items-center gap-4 mt-3">
                  {movie.rating && (
                    <div className="flex items-center gap-1 text-yellow-400" title="TMDB Rating">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="text-sm font-medium">{movie.rating.toFixed(1)}</span>
                      <span className="text-xs text-gray-500 ml-0.5">TMDB</span>
                    </div>
                  )}
                  {movie.imdb_rating && (
                    <div className="flex items-center gap-1 text-yellow-500" title="IMDB Rating">
                      <span className="text-sm font-bold">{movie.imdb_rating.toFixed(1)}</span>
                      <span className="text-xs text-gray-500">IMDB</span>
                    </div>
                  )}
                  {movie.rotten_tomatoes_score !== undefined && movie.rotten_tomatoes_score !== null && (
                    <div className="flex items-center gap-1" title="Rotten Tomatoes Tomatometer">
                      <span className={`text-sm font-bold ${movie.rotten_tomatoes_score >= 60 ? 'text-red-400' : 'text-green-400'}`}>
                        {movie.rotten_tomatoes_score}%
                      </span>
                      <span className="text-xs text-gray-500">RT</span>
                    </div>
                  )}
                  {movie.metacritic_score !== undefined && movie.metacritic_score !== null && (
                    <div className="flex items-center gap-1" title="Metacritic Metascore">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        movie.metacritic_score >= 75 ? 'bg-green-600 text-white' :
                        movie.metacritic_score >= 50 ? 'bg-yellow-600 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {movie.metacritic_score}
                      </span>
                      <span className="text-xs text-gray-500">Meta</span>
                    </div>
                  )}
                </div>
              )}

              {movie.tagline && (
                <p className="mt-3 text-gray-500 dark:text-gray-400 italic">"{movie.tagline}"</p>
              )}

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {movie.overview && (
                <p className="mt-4 text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                  {movie.overview}
                </p>
              )}
            </div>
          </div>

          {/* File Info */}
          <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
            <h3 className="text-gray-900 dark:text-white font-medium mb-2">File Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">File:</span>
                <p className="text-gray-900 dark:text-white font-mono text-xs truncate">{movie.file_name}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Size:</span>
                <p className="text-gray-900 dark:text-white">
                  {movie.file_size ? `${(movie.file_size / 1024 / 1024 / 1024).toFixed(2)} GB` : 'Unknown'}
                </p>
              </div>
              {movie.file_path && (
                <div className="col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">Location:</span>
                  <p className="text-gray-900 dark:text-white font-mono text-xs truncate" title={movie.file_path}>
                    {movie.file_path.substring(0, movie.file_path.lastIndexOf('\\')) || movie.file_path.substring(0, movie.file_path.lastIndexOf('/'))}
                  </p>
                </div>
              )}
              <div>
                <span className="text-gray-500 dark:text-gray-400">Container:</span>
                <p className="text-gray-900 dark:text-white">{movie.container || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                <p className="text-gray-900 dark:text-white">{formatDuration(movie.duration) || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Technical Media Info */}
          {movie.media_info_scanned && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Video Info */}
              <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Film className="w-4 h-4 text-blue-400" />
                  <h4 className="text-gray-900 dark:text-white font-medium">Video</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Codec:</span>
                    <span className="text-gray-900 dark:text-white">{movie.video_codec || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Resolution:</span>
                    <span className="text-gray-900 dark:text-white">{movie.video_resolution || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Aspect Ratio:</span>
                    <span className="text-gray-900 dark:text-white">{movie.video_aspect_ratio || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Frame Rate:</span>
                    <span className="text-gray-900 dark:text-white">{movie.video_framerate ? `${movie.video_framerate} fps` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Bitrate:</span>
                    <span className="text-gray-900 dark:text-white">{formatBitrate(movie.video_bitrate) || '-'}</span>
                  </div>
                  {movie.video_hdr && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">HDR:</span>
                      <span className="text-green-400 font-medium">{movie.video_hdr}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Audio Info */}
              <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <h4 className="text-gray-900 dark:text-white font-medium">Audio ({audioTracks.length} tracks)</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Primary Codec:</span>
                    <span className="text-gray-900 dark:text-white">{movie.audio_codec || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Channels:</span>
                    <span className="text-gray-900 dark:text-white">{movie.audio_channels || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Language:</span>
                    <span className="text-gray-900 dark:text-white">{movie.audio_language || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Bitrate:</span>
                    <span className="text-gray-900 dark:text-white">{formatBitrate(movie.audio_bitrate) || '-'}</span>
                  </div>
                  {audioTracks.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">All tracks:</span>
                      <div className="mt-1 space-y-1">
                        {audioTracks.map((track: any, idx: number) => (
                          <div key={idx} className="text-xs text-gray-600 dark:text-gray-300">
                            {track.codec} {track.channels} {track.language && `(${track.language})`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Subtitles Info */}
              <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Subtitles className="w-4 h-4 text-yellow-400" />
                  <h4 className="text-gray-900 dark:text-white font-medium">Subtitles ({movie.subtitle_count || 0})</h4>
                </div>
                <div className="space-y-2 text-sm">
                  {subtitleLanguages.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {subtitleLanguages.map((lang: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-200"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No embedded subtitles</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* External IDs */}
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
            <h3 className="text-gray-900 dark:text-white font-medium mb-2">External IDs</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">TMDB ID:</span>
                <p className="text-gray-900 dark:text-white">{movie.tmdb_id || 'Not scraped'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">IMDB ID:</span>
                <p className="text-gray-900 dark:text-white">{movie.imdb_id || 'Not scraped'}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleScrape}
              disabled={scrapeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${scrapeMutation.isPending ? 'animate-spin' : ''}`} />
              {scrapeMutation.isPending ? 'Refreshing...' : 'Refresh Metadata'}
            </button>
            
            <button
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <HardDrive className={`w-4 h-4 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
              {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze File'}
            </button>
            
            <button
              onClick={handleRenameFile}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Rename File
            </button>
            
            <button
              onClick={handleRenameFolder}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              <FolderEdit className="w-4 h-4" />
              Rename Folder
            </button>
            
            <button
              onClick={handleGenerateNfo}
              disabled={nfoMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              {nfoMutation.isPending ? 'Generating...' : 'Generate NFO'}
            </button>

            {/* Embed Subtitle Button - only show if movie has external subtitle */}
            {movie?.has_subtitle && movie?.subtitle_path && (
              <button
                onClick={handleMuxSubtitle}
                disabled={muxSubtitleMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <FileVideo className="w-4 h-4" />
                {muxSubtitleMutation.isPending ? 'Embedding...' : 'Embed Subtitle'}
              </button>
            )}

            {/* Delete Button with dropdown */}
            <div className="relative group">
              <button
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <Trash2 className={`w-4 h-4 ${deleteMutation.isPending ? 'animate-spin' : ''}`} />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                <button
                  onClick={() => handleDeleteClick(false, false)}
                  disabled={deleteMutation.isPending}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                >
                  Remove from library only
                </button>
                <button
                  onClick={() => handleDeleteClick(true, false)}
                  disabled={deleteMutation.isPending}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Delete media file
                </button>
                <button
                  onClick={() => handleDeleteClick(false, true)}
                  disabled={deleteMutation.isPending}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                >
                  Delete entire folder
                </button>
              </div>
            </div>
          </div>

          {/* Status indicators */}
          <div className="mt-4 flex gap-4 text-sm">
            <span className={`flex items-center gap-1 ${movie.scraped ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${movie.scraped ? 'bg-green-400' : 'bg-gray-500'}`} />
              {movie.scraped ? 'Scraped' : 'Not Scraped'}
            </span>
            <span className={`flex items-center gap-1 ${movie.media_info_scanned ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${movie.media_info_scanned ? 'bg-green-400' : 'bg-gray-500'}`} />
              {movie.media_info_scanned ? 'Analyzed' : 'Not Analyzed'}
            </span>
            <span className={`flex items-center gap-1 ${movie.has_nfo ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${movie.has_nfo ? 'bg-green-400' : 'bg-gray-500'}`} />
              {movie.has_nfo ? 'NFO Present' : 'No NFO'}
            </span>
          </div>
        </div>
      </div>

      {/* Rename Modal */}
      {showRenameModal && (
        <RenameModal 
          movie={movie}
          mode={renameMode}
          onClose={handleCloseRenameModal} 
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Movie"
        message={`Are you sure you want to delete "${movie.title}"?\n\n${
          deleteOptions.deleteFolder 
            ? '⚠️ This will permanently delete the entire folder containing this movie from your disk!'
            : deleteOptions.deleteFile 
              ? '⚠️ This will permanently delete the media file from your disk!'
              : 'This will only remove it from the library. The file will remain on disk.'
        }`}
        confirmLabel={deleteOptions.deleteFolder || deleteOptions.deleteFile ? 'Delete Files' : 'Remove from Library'}
        variant={deleteOptions.deleteFolder || deleteOptions.deleteFile ? 'danger' : 'warning'}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Mux Subtitle Confirmation Dialog */}
      <MuxConfirmDialog
        isOpen={showMuxConfirm}
        onClose={() => {
          setShowMuxConfirm(false)
          setMuxPreview(null)
          setMuxPreviewError(null)
        }}
        onConfirm={confirmMuxSubtitle}
        isLoading={muxSubtitleMutation.isPending}
        type="movie"
        preview={muxPreview}
        error={muxPreviewError}
      />
    </div>
  )
}
