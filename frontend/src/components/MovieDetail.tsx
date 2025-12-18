import { useState, useEffect } from 'react'
import { X, Edit2, FileEdit, FolderEdit, RefreshCw, FileText, Star, HardDrive, Film, Volume2, Subtitles, Trash2, FileVideo, Eye, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { moviesApi, Movie, tautulliApi } from '../services/api'
import RenameModal from './RenameModal'
import ConfirmDialog from './ConfirmDialog'
import MuxConfirmDialog from './MuxConfirmDialog'
import MessageModal, { useMessageModal } from './MessageModal'
import { useToast } from '../contexts/ToastContext'
import logger from '../services/logger'

interface MovieDetailProps {
  movieId: number
  initialMovie?: Movie
  onClose: () => void
  onDeleted?: () => void
  onPrev?: () => void
  onNext?: () => void
}

export default function MovieDetail({ movieId, initialMovie, onClose, onDeleted, onPrev, onNext }: MovieDetailProps) {
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

  // Keyboard navigation: left/right arrows to move between movies when modal is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && typeof onPrev === 'function') {
        e.preventDefault()
        onPrev()
      }
      if (e.key === 'ArrowRight' && typeof onNext === 'function') {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPrev, onNext])

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

  // Fetch watch history from Tautulli (if configured)
  const { data: watchHistory } = useQuery({
    queryKey: ['movie-watch-history', movieId, movie?.imdb_id, movie?.title, movie?.year],
    queryFn: async () => {
      if (!movie?.title && !movie?.imdb_id) return null
      try {
        const response = await tautulliApi.getMovieHistory(movie?.title, movie?.year, movie?.imdb_id, movie?.rating_key)
        return response.data
      } catch (error) {
        // Tautulli might not be configured, silently fail
        return null
      }
    },
    enabled: Boolean(movie?.title || movie?.imdb_id) && movie?.scraped && movie?.media_info_scanned,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  const { messageState, hideMessage } = useMessageModal()
  const { showToast } = useToast()

  const [showSearchEditModal, setShowSearchEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState<string | null>(null)
  const [editYear, setEditYear] = useState<number | null>(null)
  const [searchTries, setSearchTries] = useState<any[] | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const scrapeNowOverrideMutation = useMutation({
    mutationFn: (payload: { title?: string; year?: number }) => moviesApi.scrapeMovieNow(movieId, payload),
    onSuccess: async (response: any) => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      const data = response?.data
      setShowSearchEditModal(false)
      setModalError(null)
      if (data?.omdb_ratings_fetched) {
        showToast('Metadata updated', 'OMDb was used as a fallback and ratings were applied', 'info')
      } else {
        // Use a toast instead of a modal confirmation — details refresh automatically
        showToast('Metadata updated', 'Movie metadata refreshed', 'success')
      }
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.tried) {
        // Update tries and allow the user to edit/retry
        setSearchTries(detail.tried)
        setModalError('Search did not find a match — you can edit the search and try again')
      } else {
        setShowSearchEditModal(false)
        setModalError(null)
<<<<<<< HEAD
        showToast('Metadata refresh failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
=======
        showMessage('Metadata refresh failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
      }
    }
  })

  const scrapeMutation = useMutation({
    mutationFn: () => moviesApi.scrapeMovieNow(movieId),
    onSuccess: async (response: any) => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      const data = response?.data
      if (data?.omdb_ratings_fetched) {
        // Use the global toast for OMDb fallbacks instead of a modal popup
        showToast('Metadata updated', 'OMDb was used as a fallback and ratings were applied', 'info')
      } else {
        // Use a toast rather than a modal confirmation; details auto-refresh
        showToast('Metadata updated', 'Movie metadata refreshed', 'success')
      }
    },
    onError: (error: any) => {
      // If the server returned search attempts, surface an edit-dialog with the tried searches
      const detail = error?.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.tried) {
        setSearchTries(detail.tried)
        // Pre-fill the edit fields with the most relevant attempted search (override or stored_title)
        const override = detail.tried.find((t: any) => t.method === 'override')
        const stored = detail.tried.find((t: any) => t.method === 'stored_title')
        const parsed = detail.tried.find((t: any) => t.method === 'parsed_filename')
        const initial = override?.title ?? stored?.title ?? parsed?.title ?? movie?.title ?? ''
        const initialYear = override?.year ?? stored?.year ?? parsed?.year ?? movie?.year ?? null
        const cleaned = parseTitleAndYear(initial)
        setEditTitle(cleaned.title)
        // Prefer parsed year (from right-most match) if available
        setEditYear(cleaned.year ?? initialYear ?? null)
        setModalError('Search did not find a match — you can edit the search and try again')
        setShowSearchEditModal(true)
        return
      }

<<<<<<< HEAD
      showToast('Metadata refresh failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
=======
      showMessage('Metadata refresh failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
    }
  })

  const analyzeMutation = useMutation({
    mutationFn: () => moviesApi.analyzeMovie(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      showToast('Analysis Complete', 'File analysis completed successfully', 'success')
    },
    onError: (error: any) => {
      showToast('Analysis Failed', error?.response?.data?.detail || 'Failed to analyze file', 'error')
    }
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
  
    const syncWatchMutation = useMutation({
      mutationFn: () => moviesApi.syncWatchHistory(movieId),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
        await queryClient.invalidateQueries({ queryKey: ['movie-watch-history', movieId] })
        await queryClient.invalidateQueries({ queryKey: ['movies'] })
        showToast('Sync Complete', 'Watch history synced', 'success')
      },
    })

  // If rating_key is not set but option_4 appears to contain a numeric rating key, persist it to the DB
  useEffect(() => {
    const tryPersistRatingKeyFromOption4 = async () => {
      if (!movie) return
      if (movie.rating_key) return
      if (movie.option_4 && /^\d+$/.test(movie.option_4)) {
        const rk = Number(movie.option_4)
        try {
          await moviesApi.updateMovie(movieId, { rating_key: rk })
          await queryClient.invalidateQueries({ queryKey: ['movie', movieId] })
          await queryClient.invalidateQueries({ queryKey: ['movies'] })
        } catch (err) {
          // Ignore errors - this is a best-effort convenience
          console.error('Failed to persist rating_key from option_4', err)
        }
      }
    }

    tryPersistRatingKeyFromOption4()
  }, [movie, movie?.option_4, movie?.rating_key, movieId, queryClient])

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

  const handleRetryWithOverrides = () => {
    const payload: any = {}
    if (editTitle) payload.title = editTitle
    if (editYear) payload.year = editYear
    logger.buttonClick('Refresh Metadata (override)', 'MovieDetail', { movieId, title: editTitle, year: editYear })
    scrapeNowOverrideMutation.mutate(payload)
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

  const closeSearchEditModal = () => {
    setShowSearchEditModal(false)
    setModalError(null)
    setSearchTries(null)
  }

  // Try to extract a clean movie title and optional year from filenames or raw strings
  function parseTitleAndYear(raw: string | null | undefined): { title: string; year?: number | null } {
    if (!raw) return { title: '' }
    let s = String(raw)
    // Remove file extension
    s = s.replace(/\.(mkv|mp4|avi|mov|wmv|flv|mpg|mpeg)$/i, '')
    // Remove bracketed expressions
    s = s.replace(/\[.*?\]|\(.*?\)/g, ' ')
    // Replace dots/underscores with spaces
    s = s.replace(/[._]/g, ' ')
    // Remove common quality/release tags and anything after them
    s = s.replace(/\b(720p|1080p|2160p|4k|web[- ]?dl|webrip|web[- ]?dl|bluray|hdr|h264|x264|h\.264|x265|hevc|yts|rarbg|ptp|brrip|dvdrip)\b.*/i, '')
    s = s.replace(/\s+/g, ' ').trim()
    // Extract year if present (prefer the rightmost year in the string)
    const yearMatches = Array.from(s.matchAll(/(19|20)\d{2}/g))
    const lastMatch = yearMatches.length ? yearMatches[yearMatches.length - 1] : null
    const year = lastMatch ? parseInt(lastMatch[0], 10) : null
    // If year found, take title up to the rightmost year
    let title = s
    if (lastMatch && typeof lastMatch.index === 'number') {
      title = s.slice(0, lastMatch.index).trim()
    }
    // Fallback to the whole string if nothing left
    if (!title) title = s
    return { title: title, year }
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
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl transition-colors animate-mp-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 p-3 bg-black/50 rounded-full text-white hover:bg-black/70 transition-opacity duration-200 opacity-70 hover:opacity-100"
          aria-label="Close"
          title="Close"
        >
          <X className="w-8 h-8" />
        </button>

        {/* Floating prev/next navigation buttons (top of modal) - moved closer and enlarged */}
        {onPrev && (
          <button
            onClick={onPrev}
            aria-label="Previous movie"
            title="Previous"
            className="absolute top-4 left-8 z-20 p-4 bg-white dark:bg-gray-700 rounded-full shadow transform opacity-70 hover:opacity-100 hover:scale-105 transition-all duration-150"
          >
            <ChevronLeft className="w-12 h-12 text-gray-700 dark:text-gray-300" />
          </button>
        )}

        {onNext && (
          <button
            onClick={onNext}
            aria-label="Next movie"
            title="Next"
            className="absolute top-4 right-8 z-20 p-4 bg-white dark:bg-gray-700 rounded-full shadow transform opacity-70 hover:opacity-100 hover:scale-105 transition-all duration-150"
          >
            <ChevronRight className="w-12 h-12 text-gray-700 dark:text-gray-300" />
          </button>
        )}

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

          {/* File Info + Watch Count */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
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

            <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-400" />
                <h4 className="text-gray-900 dark:text-white font-medium">Watch Count</h4>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total Views</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">{watchHistory?.total_count ?? movie.watch_count ?? 0}</span>
                </div>
                <div className="mt-3">
                  <span className="text-xs text-gray-500">Last Watched</span>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {watchHistory?.history?.[0]?.date ? new Date(watchHistory.history[0].date * 1000).toLocaleString() : movie.last_watched_date ? new Date(movie.last_watched_date).toLocaleString() : 'Never'}
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xs text-gray-500">Last User</span>
                  <div className="text-sm text-gray-900 dark:text-white">{watchHistory?.history?.[0]?.user ?? movie.last_watched_user ?? '-'}</div>
                </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">TMDB ID:</span>
                <p className="text-gray-900 dark:text-white">
                  {movie.tmdb_id ? (
                    <a
                      href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {movie.tmdb_id}
                    </a>
                  ) : (
                    'Not scraped'
                  )}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">IMDB ID:</span>
                <p className="text-gray-900 dark:text-white">
                  {movie.imdb_id ? (
                    <a
                      href={`https://www.imdb.com/title/${movie.imdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {movie.imdb_id}
                    </a>
                  ) : (
                    'Not scraped'
                  )}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Plex Rating Key:</span>
                <p className="text-gray-900 dark:text-white">
                  {movie.rating_key ?? (movie.option_4 && /^\d+$/.test(movie.option_4) ? movie.option_4 : null) ? (
                    // Prefer explicit rating_key, fallback to numeric option_4
                    <span>{movie.rating_key ?? movie.option_4}</span>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Watch History (Tautulli Integration) */}
          {watchHistory && watchHistory.total_count > 0 && (
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-green-400" />
                <h3 className="text-gray-900 dark:text-white font-medium">Watch History</h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">({watchHistory.total_count} views)</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {watchHistory.history.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm p-2 bg-white dark:bg-gray-800 rounded">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-900 dark:text-white font-medium">{item.user}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                      {item.percent_complete !== undefined && (
                        <span className="text-xs">
                          {item.percent_complete}% watched
                        </span>
                      )}
                      <span className="text-xs">
                        {new Date(item.date * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6">
            {/* Top row: primary actions */}
            <div className="flex flex-wrap gap-3 mb-3">
              <button
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <HardDrive className={`w-4 h-4 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
                {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze'}
              </button>

              <button
                onClick={handleScrape}
                disabled={scrapeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${scrapeMutation.isPending ? 'animate-spin' : ''}`} />
                {scrapeMutation.isPending ? 'Refreshing...' : 'Refresh Metadata'}
              </button>

              <button
                onClick={() => syncWatchMutation.mutate()}
                disabled={syncWatchMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <Eye className={`w-4 h-4 ${syncWatchMutation.isPending ? 'animate-spin' : ''}`} />
                {syncWatchMutation.isPending ? 'Syncing...' : 'Sync Watch History'}
              </button>
            </div>

            {/* Bottom row: rename + generate on left, delete on right */}
            <div className="flex items-center gap-3">
              <div className="flex gap-3">
                <div className="relative group">
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Rename
                  </button>
                  <div className="absolute bottom-full left-0 mb-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                    <button
                      onClick={handleRenameFile}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg flex items-center gap-2"
                    >
                      <FileEdit className="w-4 h-4" />
                      Rename File
                    </button>
                    <button
                      onClick={handleRenameFolder}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg flex items-center gap-2"
                    >
                      <FolderEdit className="w-4 h-4" />
                      Rename Folder
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleGenerateNfo}
                  disabled={nfoMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  {nfoMutation.isPending ? 'Generating...' : 'Generate NFO'}
                </button>
              </div>

              <div className="ml-auto">
                {/* Delete Button with dropdown - moved to far right */}
                <div className="relative group">
                  <button
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    <Trash2 className={`w-4 h-4 ${deleteMutation.isPending ? 'animate-spin' : ''}`} />
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                  <div className="absolute bottom-full right-0 mb-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
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
            </div>
          </div>

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

          {/* Status indicators */}
          <div className="mt-4 flex gap-4 text-sm">
            <span className={`flex items-center gap-1 ${movie.scraped ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${movie.scraped ? 'bg-green-400' : 'bg-gray-500'}`} />
              {movie.scraped ? 'Scraped' : 'Not Scraped'}
            </span>
            <span className={`flex items-center gap-1 ${movie.media_info_failed ? 'text-red-400' : movie.media_info_scanned ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${movie.media_info_failed ? 'bg-red-400' : movie.media_info_scanned ? 'bg-green-400' : 'bg-gray-500'}`} />
              {movie.media_info_failed ? 'Analysis Failed' : movie.media_info_scanned ? 'Analyzed' : 'Not Analyzed'}
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

      {showSearchEditModal && (
        <SearchEditModalComponent
          title={editTitle ?? ''}
          year={editYear ?? null}
          setTitle={setEditTitle}
          setYear={setEditYear}
          tries={searchTries}
          error={modalError}
          onClose={closeSearchEditModal}
          onRetry={handleRetryWithOverrides}
          isRetrying={(scrapeNowOverrideMutation as any).isLoading}
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

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={hideMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
      />


    </div>
  )
}

// Stable modal component declared outside MovieDetail to avoid being re-created on each render
function SearchEditModalComponent({
  title,
  year,
  setTitle,
  setYear,
  tries,
  error,
  onClose,
  onRetry,
  isRetrying
}: {
  title: string
  year: number | null
  setTitle: (t: string) => void
  setYear: (y: number | null) => void
  tries: any[] | null
  error: string | null
  onClose: () => void
  onRetry: () => void
  isRetrying: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={(e) => e.stopPropagation()}>
      <div onClick={(e) => e.stopPropagation()} className="w-[540px] p-6 bg-white dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Edit search and retry</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {error && <div className="mb-4 text-sm text-yellow-400">{error}</div>}

        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">Title</label>
          <input className="w-full px-3 py-2 rounded bg-gray-100 dark:bg-gray-700" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">Year</label>
          <input className="w-40 px-3 py-2 rounded bg-gray-100 dark:bg-gray-700" value={year ?? ''} onChange={(e) => setYear(Number(e.target.value) || null)} />
        </div>

        {tries && (
          <div className="mb-4 text-sm text-gray-400">
            <div className="font-medium mb-1">Tried searches:</div>
            <ul className="list-disc list-inside">
              {tries.map((t: any, idx: number) => (
                <li key={idx}>{t.method}: {t.title ?? t.imdb_id ?? t.tmdb_id ?? t.path ?? ''} {t.year ? `(${t.year})` : ''}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 bg-transparent hover:bg-gray-700 transition-colors" onClick={onClose}>Cancel</button>
          <button className={`px-4 py-2 rounded-lg text-white transition-colors ${isRetrying ? 'bg-indigo-500' : 'bg-indigo-600 hover:bg-indigo-700'}`} onClick={onRetry} disabled={isRetrying}>{isRetrying ? 'Retrying...' : 'Retry'}</button>
        </div>
      </div>
    </div>
  )
}
