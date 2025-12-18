import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Filter, SortAsc, SortDesc, Search, HardDrive, Loader2, RefreshCw, 
  LayoutGrid, List, Settings2, Database, X, Trash2, Pencil, Edit2, FolderEdit, Eye
} from 'lucide-react'
import MediaGrid from '../components/MediaGrid'
import MediaList, { getDefaultVisibleColumns, AVAILABLE_COLUMNS, ColumnDef } from '../components/MediaList'
import MovieDetail from '../components/MovieDetail'
import MessageModal, { useMessageModal } from '../components/MessageModal'
import { useToast } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { moviesApi, libraryApi, Movie } from '../services/api'
import logger from '../services/logger'

// localStorage keys for persistence
const STORAGE_KEY_VIEW_MODE = 'mediapruner_movies_view_mode'
const STORAGE_KEY_COLUMNS = 'mediapruner_movies_columns'
const STORAGE_KEY_PAGE_SIZE = 'mediapruner_movies_page_size'

// Available page sizes
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500]

type ViewMode = 'grid' | 'list'

// Filter state interface
interface Filters {
  scraped: 'all' | 'yes' | 'no'
  analyzed: 'all' | 'yes' | 'no' | 'failed'
  hasNfo: 'all' | 'yes' | 'no'
  watched: 'all' | 'yes' | 'no'
  minYear: string
  maxYear: string
  // TMDB rating (0-10)
  minRating: string
  maxRating: string
  // IMDB rating (0-10)
  minImdbRating: string
  maxImdbRating: string
  // Rotten Tomatoes (0-100)
  minRottenTomatoes: string
  maxRottenTomatoes: string
  // Metacritic (0-100)
  minMetacritic: string
  maxMetacritic: string
  resolution: string
}

export default function Movies() {
  // Log page view on mount
  useEffect(() => {
    logger.pageView('Movies')
  }, [])

  const queryClient = useQueryClient()
<<<<<<< HEAD
  const { messageState, hideMessage } = useMessageModal()
=======
  const { messageState, showMessage, hideMessage } = useMessageModal()
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PAGE_SIZE)
    const parsed = saved ? parseInt(saved, 10) : null
    return parsed && PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : 100
  })
  const [sortBy, setSortBy] = useState('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const columnSettingsRef = useRef<HTMLDivElement>(null)
  // Default to list view, but load from localStorage if available
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE)
    return (saved === 'grid' || saved === 'list') ? saved : 'list'
  })
  const [showFilters, setShowFilters] = useState(false)
  // Selection state for list view
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteOptions, setDeleteOptions] = useState<{ deleteFile: boolean; deleteFolder: boolean }>({ deleteFile: false, deleteFolder: false })
  // Edit mode state - when true, shows checkboxes for selection
  const [editMode, setEditMode] = useState(false)
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COLUMNS)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return getDefaultVisibleColumns()
      }
    }
    return getDefaultVisibleColumns()
  })

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode)
    // Exit edit mode when switching away from list view
    if (viewMode !== 'list') {
      setEditMode(false)
      setSelectedIds(new Set())
    }
  }, [viewMode])

  // Persist page size to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PAGE_SIZE, pageSize.toString())
  }, [pageSize])

  // Persist column visibility to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Close column settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setShowColumnSettings(false)
      }
    }

    if (showColumnSettings) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnSettings])

  const [filters, setFilters] = useState<Filters>({
    scraped: 'all',
    analyzed: 'all',
    hasNfo: 'all',
    watched: 'all',
    minYear: '',
    maxYear: '',
    minRating: '',
    maxRating: '',
    minImdbRating: '',
    maxImdbRating: '',
    minRottenTomatoes: '',
    maxRottenTomatoes: '',
    minMetacritic: '',
    maxMetacritic: '',
    resolution: 'all',
  })

  // Log filter changes (debounced with ref to prevent initial log)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    // Log non-default filters
    const activeFilters = Object.entries(filters)
      .filter(([key, value]) => {
        if (key === 'resolution' || key === 'scraped' || key === 'analyzed' || key === 'hasNfo') {
          return value !== 'all'
        }
        return value !== ''
      })
      .map(([key, value]) => `${key}=${value}`)
    if (activeFilters.length > 0) {
      logger.filterChange('filters', activeFilters.join(', '), 'Movies')
    }
  }, [filters])

  const { data, isPending: isLoading } = useQuery({
    queryKey: ['movies', page, pageSize, sortBy, sortOrder, searchQuery, filters.watched],
    queryFn: () => moviesApi.getMovies({
      page,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
      search: searchQuery || undefined,
      watched: filters.watched === 'all' ? undefined : filters.watched === 'yes',
    }).then(res => res.data),
    placeholderData: (previousData) => previousData,
  })

  const refreshMutation = useMutation({
    mutationFn: () => libraryApi.refresh(),
    onSuccess: async (result) => {
      const data = result.data
      const removed = data.removed.movies
      const added = data.added.movies
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      if (removed > 0 || added > 0) {
        showToast(
          'Refresh Complete',
          `• Removed ${removed} missing movies\n• Added ${added} new movies`,
          'success'
        )
      } else {
        showToast('Library Up to Date', 'No changes detected in your library.', 'info')
      }
    },
    onError: (error: any) => {
      logger.error('Refresh library failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Refresh Failed', error?.response?.data?.detail || 'Failed to refresh library', 'error')
    }
  })

  const syncWatchHistoryMutation = useMutation({
    mutationFn: () => moviesApi.syncAllWatchHistory(),
    onSuccess: async (result) => {
      const data = result.data as { 
        total_movies: number; 
        synced_count: number; 
        watched_count: number;
        skipped_count?: number;
        message?: string;
      }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      
      let message = `Synced ${data.synced_count} movies from Tautulli.\n${data.watched_count} movies marked as watched.`
      if (data.skipped_count && data.skipped_count > 0) {
        message += `\n\n⚠️ Skipped ${data.skipped_count} movies without metadata.\nPlease scrape metadata first for complete sync.`
      }
      
      showToast(
        'Sync Complete',
        message,
        data.skipped_count && data.skipped_count > 0 ? 'info' : 'success'
      )
    },
    onError: (error: any) => {
      logger.error('Sync watch history failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Sync Failed', error?.response?.data?.detail || 'Failed to sync watch history. Is Tautulli configured?', 'error')
    }
  })

  const syncWatchBatchMutation = useMutation({
    mutationFn: (movieIds?: number[]) => moviesApi.syncWatchHistoryBatch(movieIds),
    onSuccess: async (result) => {
      const data = result.data as { requested?: number | null; synced_count: number; watched_count: number; errors?: string[] }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      showToast('Sync Complete', `Synced watch history for ${data.synced_count} movies.`, 'success')
    },
    onError: (error: any) => {
      logger.error('Sync watch history failed', 'Movies', { error, errorMessage: error?.response?.data?.detail || error?.message })
      showToast('Sync Failed', error?.response?.data?.detail || 'Failed to sync watch history', 'error')
    }
  })

  const analyzeMutation = useMutation({
    mutationFn: (movieIds: number[]) => moviesApi.analyzeMoviesBatch(movieIds),
    onSuccess: async (result) => {
      const data = result.data as { analyzed: number; total: number }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      showToast(
        'Analysis Complete',
        `Successfully analyzed ${data.analyzed} of ${data.total} movies.`,
        'success'
      )
    },
    onError: (error: any) => {
      logger.error('Analyze movies failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Analysis Failed', error?.response?.data?.detail || 'Failed to analyze movies', 'error')
    }
  })

  const scrapeMutation = useMutation({
    mutationFn: (movieIds: number[]) => moviesApi.scrapeMoviesBatch(movieIds),
    onSuccess: async (result) => {
      const data = result.data as { scraped: number; total: number; errors?: string[] }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      showToast(
        'Metadata Refresh Complete',
        `Successfully refreshed metadata for ${data.scraped} of ${data.total} movies.${data.errors?.length ? `\n${data.errors.length} errors occurred.` : ''}`,
        data.scraped === data.total ? 'success' : 'warning'
      )
    },
    onError: (error: any) => {
      logger.error('Metadata refresh failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Metadata Refresh Failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
    }
  })

  const fetchOmdbMutation = useMutation({
    mutationFn: (movieIds?: number[]) => moviesApi.refreshMoviesBatch(movieIds || [], true),
    onSuccess: async (result) => {
      // The refreshMoviesBatch enqueues a refresh task that will include ratings
      const data = result.data as { task_id?: number }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      showToast('Fetch Ratings Enqueued', `Task ${data.task_id} enqueued to refresh metadata with ratings.`, 'info')
    },
    onError: (error: any) => {
      logger.error('OMDb fetch failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('OMDb Fetch Failed', error?.response?.data?.detail || 'Failed to fetch OMDb ratings', 'error')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (params: { movieIds: number[]; deleteFile: boolean; deleteFolder: boolean }) => 
      moviesApi.deleteMoviesBatch(params.movieIds, { deleteFile: params.deleteFile, deleteFolder: params.deleteFolder }),
    onSuccess: async (result) => {
      const data = result.data as { deleted: number; total: number; errors?: string[] }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      setSelectedIds(new Set())
      showToast(
        'Delete Complete',
        `Deleted ${data.deleted} of ${data.total} movies.${data.errors?.length ? `\n${data.errors.length} errors occurred.` : ''}`,
        data.deleted === data.total ? 'success' : 'warning'
      )
    },
    onError: (error: any) => {
      logger.error('Delete movies failed', 'Movies', { 
        error,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Delete Failed', error?.response?.data?.detail || 'Failed to delete movies', 'error')
    }
  })

  const renameFilesMutation = useMutation({
    mutationFn: (movieIds: number[]) => 
      moviesApi.renameMoviesBatch(movieIds, '{title} ({year})'),
    onSuccess: async (result) => {
      const data = result.data as { renamed: number; total: number; errors?: string[] }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      setSelectedIds(new Set())
      setEditMode(false)
      showToast(
        'Rename Complete',
        `Renamed ${data.renamed} of ${data.total} files.${data.errors?.length ? `\n\nErrors:\n${data.errors.slice(0, 5).join('\n')}${data.errors.length > 5 ? `\n...and ${data.errors.length - 5} more` : ''}` : ''}`,
        data.renamed === data.total ? 'success' : 'warning'
      )
    },
    onError: (error: any) => {
      logger.error('Rename files failed', 'Movies', { 
        error,
        count: selectedIds.size,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Rename Failed', error?.response?.data?.detail || 'Failed to rename files', 'error')
    }
  })

  const renameFoldersMutation = useMutation({
    mutationFn: (movieIds: number[]) => 
      moviesApi.renameFoldersBatch(movieIds, '{title} ({year})'),
    onSuccess: async (result) => {
      const data = result.data as { renamed: number; total: number; errors?: string[] }
      await queryClient.invalidateQueries({ queryKey: ['movies'] })
      await queryClient.refetchQueries({ queryKey: ['movies'] })
      setSelectedIds(new Set())
      setEditMode(false)
      showToast(
        'Rename Complete',
        `Renamed ${data.renamed} of ${data.total} folders.${data.errors?.length ? `\n\nErrors:\n${data.errors.slice(0, 5).join('\n')}${data.errors.length > 5 ? `\n...and ${data.errors.length - 5} more` : ''}` : ''}`,
        data.renamed === data.total ? 'success' : 'warning'
      )
    },
    onError: (error: any) => {
      logger.error('Rename folders failed', 'Movies', { 
        error,
        count: selectedIds.size,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Rename Failed', error?.response?.data?.detail || 'Failed to rename folders', 'error')
    }
  })

  let movies: Movie[] = data?.movies || []
  const totalPages = data?.total_pages || 1

  // Apply client-side filters
  movies = movies.filter(movie => {
    if (filters.scraped === 'yes' && !movie.scraped) return false
    if (filters.scraped === 'no' && movie.scraped) return false
    if (filters.analyzed === 'yes' && !movie.media_info_scanned) return false
    if (filters.analyzed === 'no' && movie.media_info_scanned) return false
    if (filters.analyzed === 'failed' && !movie.media_info_failed) return false
    if (filters.hasNfo === 'yes' && !movie.has_nfo) return false
    if (filters.hasNfo === 'no' && movie.has_nfo) return false
    if (filters.minYear && movie.year && movie.year < parseInt(filters.minYear)) return false
    if (filters.maxYear && movie.year && movie.year > parseInt(filters.maxYear)) return false
    // TMDB rating filter
    if (filters.minRating && movie.rating !== undefined && movie.rating !== null && movie.rating < parseFloat(filters.minRating)) return false
    if (filters.maxRating && movie.rating !== undefined && movie.rating !== null && movie.rating > parseFloat(filters.maxRating)) return false
    // IMDB rating filter
    if (filters.minImdbRating && movie.imdb_rating !== undefined && movie.imdb_rating !== null && movie.imdb_rating < parseFloat(filters.minImdbRating)) return false
    if (filters.maxImdbRating && movie.imdb_rating !== undefined && movie.imdb_rating !== null && movie.imdb_rating > parseFloat(filters.maxImdbRating)) return false
    // Rotten Tomatoes filter (0-100)
    if (filters.minRottenTomatoes && movie.rotten_tomatoes_score !== undefined && movie.rotten_tomatoes_score !== null && movie.rotten_tomatoes_score < parseInt(filters.minRottenTomatoes)) return false
    if (filters.maxRottenTomatoes && movie.rotten_tomatoes_score !== undefined && movie.rotten_tomatoes_score !== null && movie.rotten_tomatoes_score > parseInt(filters.maxRottenTomatoes)) return false
    // Metacritic filter (0-100)
    if (filters.minMetacritic && movie.metacritic_score !== undefined && movie.metacritic_score !== null && movie.metacritic_score < parseInt(filters.minMetacritic)) return false
    if (filters.maxMetacritic && movie.metacritic_score !== undefined && movie.metacritic_score !== null && movie.metacritic_score > parseInt(filters.maxMetacritic)) return false
    if (filters.resolution !== 'all' && movie.video_resolution) {
      if (filters.resolution === '4k' && !movie.video_resolution.includes('2160') && !movie.video_resolution.toLowerCase().includes('4k')) return false
      if (filters.resolution === '1080p' && !movie.video_resolution.includes('1080')) return false
      if (filters.resolution === '720p' && !movie.video_resolution.includes('720')) return false
      if (filters.resolution === 'sd' && (movie.video_resolution.includes('1080') || movie.video_resolution.includes('720') || movie.video_resolution.includes('2160'))) return false
    }
    return true
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Require at least 3 characters for search
    const trimmedInput = searchInput.trim()
    if (trimmedInput.length > 0 && trimmedInput.length < 3) {
      showToast('Search Too Short', 'Please enter at least 3 characters to search.', 'info')
      return
    }
    logger.search(searchInput, 'Movies')
    setSearchQuery(searchInput)
    setPage(1)
  }

  const handleMovieClick = (item: { id: number }) => {
    const movie = (data?.movies || []).find((m: Movie) => m.id === item.id)
    if (movie) {
      logger.modal('open', `MovieDetail: ${movie.title}`, 'Movies')
      setSelectedMovie(movie)
    }
  }

  const handleListMovieClick = (movie: Movie) => {
    logger.modal('open', `MovieDetail: ${movie.title}`, 'Movies')
    setSelectedMovie(movie)
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      logger.sortChange(column, newOrder, 'Movies')
      setSortOrder(newOrder)
    } else {
      logger.sortChange(column, 'asc', 'Movies')
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const toggleSortOrder = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    logger.sortChange(sortBy, newOrder, 'Movies')
    setSortOrder(newOrder)
  }

  const toggleColumn = (columnId: string) => {
    if (visibleColumns.includes(columnId)) {
      // Don't allow hiding all columns - keep at least title
      if (columnId === 'title' || visibleColumns.length <= 1) return
      logger.uiInteraction('column', `hide ${columnId}`, 'Movies')
      setVisibleColumns(visibleColumns.filter(c => c !== columnId))
    } else {
      logger.uiInteraction('column', `show ${columnId}`, 'Movies')
      setVisibleColumns([...visibleColumns, columnId])
    }
  }

  const handleToggleColumnSettings = () => {
    logger.uiInteraction('column-settings', showColumnSettings ? 'close' : 'open', 'Movies')
    setShowColumnSettings(!showColumnSettings)
  }

  const handleResetColumns = () => {
    logger.buttonClick('Reset Columns', 'Movies')
    setVisibleColumns(getDefaultVisibleColumns())
  }

  const isColumnVisible = (columnId: string) => visibleColumns.includes(columnId)

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'minYear' || key === 'maxYear' || 
        key === 'minRating' || key === 'maxRating' ||
        key === 'minImdbRating' || key === 'maxImdbRating' ||
        key === 'minRottenTomatoes' || key === 'maxRottenTomatoes' ||
        key === 'minMetacritic' || key === 'maxMetacritic') return value !== ''
    return value !== 'all'
  }).length

  // Include search in total active filters count
  const hasActiveSearch = searchInput.trim() !== '' || searchQuery.trim() !== ''
  const totalActiveFilters = activeFilterCount + (hasActiveSearch ? 1 : 0)

  const resetFilters = () => {
    logger.buttonClick('Reset Filters', 'Movies')
    // Clear search
    setSearchInput('')
    setSearchQuery('')
    // Clear filters
    setFilters({
      scraped: 'all',
      analyzed: 'all',
      hasNfo: 'all',
      watched: 'all',
      minYear: '',
      maxYear: '',
      minRating: '',
      maxRating: '',
      minImdbRating: '',
      maxImdbRating: '',
      minRottenTomatoes: '',
      maxRottenTomatoes: '',
      minMetacritic: '',
      maxMetacritic: '',
      resolution: 'all',
    })
  }

  // Batch progress tracking for long-running operations (shows current/total)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; actionName?: string } | null>(null)
  const cancelRequestedRef = useRef(false)

  // Scope Confirmation Modal state (confirm whether to apply to filtered results or all matches)
  const [scopeModal, setScopeModal] = useState<{ isOpen: boolean; actionName?: string; total?: number; currentCount?: number; onConfirmAll?: () => void; onConfirmPage?: () => void }>({ isOpen: false })

  const processIdsWithProgress = async (ids: number[], actionName: string) => {
    if (!ids || ids.length === 0) return
    cancelRequestedRef.current = false
    setBatchProgress({ current: 0, total: ids.length, actionName })

    let successCount = 0
    const errors: string[] = []

    for (let i = 0; i < ids.length; i++) {
      if (cancelRequestedRef.current) break
      const id = ids[i]
      setBatchProgress({ current: i + 1, total: ids.length, actionName })

      try {
        if (actionName === 'Analyze') {
          await moviesApi.analyzeMovie(id)
          successCount += 1
        } else if (actionName === 'Refresh Metadata') {
          // Enqueue refresh task for the whole batch instead of per-item processing
          // This will be handled outside the loop by the caller when selected ids are provided
          // For safety, call single-item enqueue here (fallback)
          const res = await moviesApi.scrapeMovie(id)
          if (res && res.data && res.data.task_id) {
            successCount += 1
          }
        } else if (actionName === 'Fetch Ratings') {
          // Use refresh metadata with include_ratings for this id
          const resp = await moviesApi.refreshMoviesBatch([id], true)
          if (resp && resp.status === 200) successCount += 1
        } else if (actionName === 'Sync Watch History') {
          // Enqueue sync per-item as a fallback (don't run inline)
          const resp = await moviesApi.syncWatchHistoryBatch([id])
          if (resp && resp.data && resp.data.task_id) {
            successCount += 1
          }
        } else {
          // For other actions fallback to batch mutation (shouldn't happen here)
          // leave successCount unchanged
        }
      } catch (err: any) {
        errors.push(`${id}: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`)
      }
    }

    setBatchProgress(null)

    // Close the scope modal if it was open for this action
    setScopeModal(s => ({ ...s, isOpen: false }))

    // Refresh movie list after operation
    await queryClient.invalidateQueries({ queryKey: ['movies'] })
    await queryClient.refetchQueries({ queryKey: ['movies'] })

    if (cancelRequestedRef.current) {
      showToast(`${actionName} Canceled`, `Canceled after ${successCount} of ${ids.length} items.`, 'warning')
    } else if (errors.length > 0) {
      showToast(`${actionName} Completed with Errors`, `${successCount} of ${ids.length} succeeded. ${errors.length} errors occurred.`, 'warning')
    } else {
      showToast(`${actionName} Complete`, `Successfully processed ${successCount} of ${ids.length} items.`, 'success')
    }

    // Reset cancel flag
    cancelRequestedRef.current = false
  }

  // Get current process status
  const getProcessStatus = () => {
    // If we have an active batchProgress, show it first
    if (batchProgress) {
      return { running: true, label: `${batchProgress.actionName || 'Processing'} (${batchProgress.current}/${batchProgress.total})` }
    }

    if (deleteMutation.isPending) {
      return { running: true, label: 'Deleting movies...' }
    }
    if (analyzeMutation.isPending) {
      return { running: true, label: 'Analyzing movies...' }
    }
    if (scrapeMutation.isPending) {
      return { running: true, label: 'Refreshing metadata...' }
    }
    if (fetchOmdbMutation.isPending) {
      return { running: true, label: 'Fetching OMDb ratings...' }
    }
    if (refreshMutation.isPending) {
      return { running: true, label: 'Refreshing library...' }
    }
    if (renameFilesMutation.isPending) {
      return { running: true, label: 'Renaming files...' }
    }
    if (renameFoldersMutation.isPending) {
      return { running: true, label: 'Renaming folders...' }
    }
    return { running: false, label: '' }
  }

  const isAnyProcessRunning = Boolean(batchProgress) || analyzeMutation.isPending || scrapeMutation.isPending || fetchOmdbMutation.isPending || refreshMutation.isPending || deleteMutation.isPending || renameFilesMutation.isPending || renameFoldersMutation.isPending

  const processStatus = getProcessStatus()

  // Get movie IDs for the currently filtered list
  const getFilteredMovieIds = () => movies.map(m => m.id)

  // Fetch all matching movie IDs from server for full filtered operations
  const getAllMatchingMovieIds = async () => {
    const params: any = {}
    if (searchQuery) params.search = searchQuery
    if (filters.watched && filters.watched !== 'all') params.watched = filters.watched === 'yes'
    // Pass client-only filters to server so 'all matching' respects UI filters
    if (filters.scraped && filters.scraped !== 'all') params.scraped = filters.scraped
    if (filters.analyzed && filters.analyzed !== 'all') params.analyzed = filters.analyzed
    if (filters.hasNfo && filters.hasNfo !== 'all') params.hasNfo = filters.hasNfo
    if (filters.resolution && filters.resolution !== 'all') params.resolution = filters.resolution
    if (filters.minRating) params.minRating = parseFloat(filters.minRating)
    if (filters.maxRating) params.maxRating = parseFloat(filters.maxRating)
    if (filters.minImdbRating) params.minImdbRating = parseFloat(filters.minImdbRating)
    if (filters.maxImdbRating) params.maxImdbRating = parseFloat(filters.maxImdbRating)
    if (filters.minRottenTomatoes) params.minRottenTomatoes = parseInt(filters.minRottenTomatoes)
    if (filters.maxRottenTomatoes) params.maxRottenTomatoes = parseInt(filters.maxRottenTomatoes)
    if (filters.minMetacritic) params.minMetacritic = parseInt(filters.minMetacritic)
    if (filters.maxMetacritic) params.maxMetacritic = parseInt(filters.maxMetacritic)
    const resp = await moviesApi.getMovieIds(params)
    return resp.data.ids
  }

  const confirmScopeAndRun = async (actionName: string, mutation: any) => {
    try {
      // If the user has explicit selections in edit mode, apply only to those selected IDs
      let ids: number[] = []
      if (selectedIds.size > 0) {
        ids = Array.from(selectedIds)
      } else {
        ids = getFilteredMovieIds()

        // If there are more matching results than the current page, show modal to choose whether to apply to all matches or only filtered results
        if (data?.total && data.total > movies.length) {
        setScopeModal({
          isOpen: true,
          actionName,
          total: data.total,
          currentCount: movies.length,
          // Keep the dialog open while running so users can see progress and cancel
          onConfirmAll: async () => {
            const allIds = await getAllMatchingMovieIds()
<<<<<<< HEAD
            if (actionName === 'Refresh Metadata' || actionName === 'Analyze' || actionName === 'Sync Watch History' || actionName === 'Fetch Ratings') {
=======
            if (actionName === 'Refresh Metadata' || actionName === 'Analyze' || actionName === 'Sync Watch History') {
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
              // Enqueue a single batch task
              const resp = actionName === 'Refresh Metadata'
                ? await moviesApi.refreshMoviesBatch(allIds)
                : actionName === 'Analyze'
                  ? await moviesApi.analyzeMoviesBatch(allIds)
<<<<<<< HEAD
                  : actionName === 'Fetch Ratings'
                    ? await moviesApi.refreshMoviesBatch(allIds, true)
                    : await moviesApi.syncWatchHistoryBatch(allIds)
=======
                  : await moviesApi.syncWatchHistoryBatch(allIds)
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
              // Use a toast not modal for confirmations
              showToast(`${actionName} Enqueued`, `Task ${resp.data.task_id} enqueued for ${allIds.length} movies.`, 'info')
              setScopeModal(s => ({ ...s, isOpen: false }))
              return
            }
            // Start per-item processing with progress
            processIdsWithProgress(allIds, actionName)
          },
          onConfirmPage: () => {
<<<<<<< HEAD
            if (actionName === 'Refresh Metadata' || actionName === 'Analyze' || actionName === 'Sync Watch History' || actionName === 'Fetch Ratings') {
=======
            if (actionName === 'Refresh Metadata' || actionName === 'Analyze' || actionName === 'Sync Watch History') {
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
              const resp = actionName === 'Refresh Metadata'
                ? moviesApi.refreshMoviesBatch(ids)
                : actionName === 'Analyze'
                  ? moviesApi.analyzeMoviesBatch(ids)
<<<<<<< HEAD
                  : actionName === 'Fetch Ratings'
                    ? moviesApi.refreshMoviesBatch(ids, true)
                    : moviesApi.syncWatchHistoryBatch(ids)
=======
                  : moviesApi.syncWatchHistoryBatch(ids)
>>>>>>> 79f6ee5 (chore(security): add detect-secrets baseline & CI checks (#5))
              resp.then(r => showToast(`${actionName} Enqueued`, `Task ${r.data.task_id} enqueued for ${ids.length} movies.`, 'info'))
              setScopeModal(s => ({ ...s, isOpen: false }))
              return
            }
            // Start per-item processing for current page
            processIdsWithProgress(ids, actionName)
          }
        })
        return
      }
      }
      // If it's one of the actions that supports per-item progress, run per-item so we can show progress
      if (['Analyze', 'Refresh Metadata', 'Fetch Ratings'].includes(actionName)) {
        if (actionName === 'Refresh Metadata' || actionName === 'Analyze') {
          const resp = actionName === 'Refresh Metadata'
            ? await moviesApi.refreshMoviesBatch(ids)
            : await moviesApi.analyzeMoviesBatch(ids)
          showToast(`${actionName} Enqueued`, `Task ${resp.data.task_id} enqueued for ${ids.length} movies.`, 'info')
        }

        await processIdsWithProgress(ids, actionName)
        return
      }

      // Sync Watch History should be enqueued when run from grid/batch workflows
      if (actionName === 'Sync Watch History') {
        const resp = await moviesApi.syncWatchHistoryBatch(ids)
        showToast(`${actionName} Enqueued`, `Task ${resp.data.task_id} enqueued for ${ids.length} movies.`, 'info')
        return
      }

      // Fallback: use existing batch mutation
      mutation.mutate(ids)
    } catch (error: any) {
      logger.error(`${actionName} failed to start`, 'Movies', { error })
      showToast(`${actionName} Failed`, 'Could not start operation', 'error')
    }
  }

  // Handle delete confirmation
  const handleDeleteSelected = (deleteFile: boolean, deleteFolder: boolean) => {
    setDeleteOptions({ deleteFile, deleteFolder })
    setDeleteConfirmOpen(true)
  }

  // Confirmation modal state (confirm whether to apply to filtered results or all matches)
  // (Moved earlier to be available to functions that call it)

  // Toggle edit mode - clears selection when exiting
  const toggleEditMode = () => {
    const newEditMode = !editMode
    logger.editMode(newEditMode, 'Movies')
    if (editMode) {
      setSelectedIds(new Set())
    }
    setEditMode(newEditMode)
  }

  const confirmDelete = () => {
    if (selectedIds.size > 0) {
      logger.dataOperation('delete', `${selectedIds.size} movies`, 'Movies', {
        deleteFile: deleteOptions.deleteFile,
        deleteFolder: deleteOptions.deleteFolder
      })
      deleteMutation.mutate({
        movieIds: Array.from(selectedIds),
        deleteFile: deleteOptions.deleteFile,
        deleteFolder: deleteOptions.deleteFolder
      })
    }
    setDeleteConfirmOpen(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Search, Sort, Filter, Status, and Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px] max-w-md">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, genre, quality..."
              className="w-full pl-10 pr-8 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-primary-500 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            >
              <option value="title">Title</option>
              <option value="year">Year</option>
              <option value="rating">Rating</option>
              <option value="created_at">Date Added</option>
              <option value="file_size">File Size</option>
              <option value="duration">Duration</option>
              <option value="video_resolution">Resolution</option>
              <option value="video_codec">Video Codec</option>
              <option value="audio_codec">Audio Codec</option>
              <option value="release_group">Release Group</option>
              <option value="quality">Quality</option>
              <option value="genres">Genres</option>
            </select>
            <button
              onClick={toggleSortOrder}
              className="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? <SortAsc className="w-5 h-5" /> : <SortDesc className="w-5 h-5" />}
            </button>
          </div>
          
          {/* Filter Button */}
          <button 
            onClick={() => {
              logger.uiInteraction('filters-panel', showFilters ? 'close' : 'open', 'Movies')
              setShowFilters(!showFilters)
            }}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-white text-primary-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Clear Filters Button - show when filters panel is open, filters are active, or search has text */}
          {(showFilters || totalActiveFilters > 0) && (
            <button
              onClick={resetFilters}
              disabled={totalActiveFilters === 0}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
                totalActiveFilters > 0
                  ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed'
              }`}
              title="Clear all filters and search"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
              {totalActiveFilters > 0 && (
                <span className="bg-white text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {totalActiveFilters}
                </span>
              )}
            </button>
          )}

          {/* Stats - showing count */}
          {data && (
            <div className="ml-auto text-gray-500 dark:text-gray-400 text-sm">
              Showing {movies.length} of {data.total} movies
              {activeFilterCount > 0 && ` (${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied)`}
            </div>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 dark:text-white font-medium">Filters</h3>
              <button 
                onClick={resetFilters}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                Reset all
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
              {/* Scraped Filter */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Scraped</label>
                <select
                  value={filters.scraped}
                  onChange={(e) => {
                    logger.filterChange('scraped', e.target.value, 'Movies')
                    setFilters(f => ({ ...f, scraped: e.target.value as any }))
                  }}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {/* Analyzed Filter */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Analyzed</label>
                <select
                  value={filters.analyzed}
                  onChange={(e) => {
                    logger.filterChange('analyzed', e.target.value, 'Movies')
                    setFilters(f => ({ ...f, analyzed: e.target.value as any }))
                  }}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Has NFO Filter */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Has NFO</label>
                <select
                  value={filters.hasNfo}
                  onChange={(e) => setFilters(f => ({ ...f, hasNfo: e.target.value as any }))}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {/* Watched Filter */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Watched</label>
                <select
                  value={filters.watched}
                  onChange={(e) => setFilters(f => ({ ...f, watched: e.target.value as any }))}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                >
                  <option value="all">All</option>
                  <option value="yes">Watched</option>
                  <option value="no">Unwatched</option>
                </select>
              </div>

              {/* Resolution Filter */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Resolution</label>
                <select
                  value={filters.resolution}
                  onChange={(e) => setFilters(f => ({ ...f, resolution: e.target.value }))}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                >
                  <option value="all">All</option>
                  <option value="4k">4K / 2160p</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="sd">SD</option>
                </select>
              </div>

              {/* Year Range */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min Year</label>
                <input
                  type="number"
                  value={filters.minYear}
                  onChange={(e) => setFilters(f => ({ ...f, minYear: e.target.value }))}
                  placeholder="1900"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Year</label>
                <input
                  type="number"
                  value={filters.maxYear}
                  onChange={(e) => setFilters(f => ({ ...f, maxYear: e.target.value }))}
                  placeholder="2025"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              {/* Rating Range */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min TMDB</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={filters.minRating}
                  onChange={(e) => setFilters(f => ({ ...f, minRating: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max TMDB</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={filters.maxRating}
                  onChange={(e) => setFilters(f => ({ ...f, maxRating: e.target.value }))}
                  placeholder="10"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              {/* IMDB Rating Range */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min IMDB</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={filters.minImdbRating}
                  onChange={(e) => setFilters(f => ({ ...f, minImdbRating: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max IMDB</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={filters.maxImdbRating}
                  onChange={(e) => setFilters(f => ({ ...f, maxImdbRating: e.target.value }))}
                  placeholder="10"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              {/* Rotten Tomatoes Range */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min RT %</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={filters.minRottenTomatoes}
                  onChange={(e) => setFilters(f => ({ ...f, minRottenTomatoes: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max RT %</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={filters.maxRottenTomatoes}
                  onChange={(e) => setFilters(f => ({ ...f, maxRottenTomatoes: e.target.value }))}
                  placeholder="100"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              {/* Metacritic Range */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Min Meta</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={filters.minMetacritic}
                  onChange={(e) => setFilters(f => ({ ...f, minMetacritic: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Meta</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={filters.maxMetacritic}
                  onChange={(e) => setFilters(f => ({ ...f, maxMetacritic: e.target.value }))}
                  placeholder="100"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-white text-sm transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar Row - View Toggle, Actions, Columns */}
      <div className="flex items-center justify-between p-2 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors">
        {/* Left side - View Toggle, Action Buttons, Columns */}
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 transition-colors">
            <button
              onClick={() => {
                logger.viewMode('grid', 'Movies')
                setViewMode('grid')
              }}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                logger.viewMode('list', 'Movies')
                setViewMode('list')
              }}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Analyze Button */}
          <button
            onClick={() => {
              logger.buttonClick('Analyze', 'Movies', { count: movies.length })
              confirmScopeAndRun('Analyze', analyzeMutation)
            }}
            disabled={isAnyProcessRunning || movies.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
            title={`Analyze ${movies.length} movie${movies.length !== 1 ? 's' : ''} with MediaInfo`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Analyze</span>
          </button>

          {/* Refresh Metadata Button */}
          <button
            onClick={() => {
              logger.buttonClick('Refresh Metadata', 'Movies', { count: movies.length })
              confirmScopeAndRun('Refresh Metadata', scrapeMutation)
            }}
            disabled={isAnyProcessRunning || movies.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
            title={`Refresh metadata for ${movies.length} movie${movies.length !== 1 ? 's' : ''} from TMDB`}
          >
            <Database className="w-4 h-4" />
            <span>Refresh Metadata</span>
          </button>
          

          
          {/* Refresh Library Button */}
          <button
            onClick={() => {
              logger.buttonClick('Refresh Library', 'Movies')
              refreshMutation.mutate()
            }}
            disabled={isAnyProcessRunning}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
            title="Refresh library: remove missing files and add new ones"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          {/* Sync Watch History Button */}
          <button
            onClick={() => {
              logger.buttonClick('Sync Watch History', 'Movies')
              // Use confirm scope run to optionally run on all matching movies
              confirmScopeAndRun('Sync Watch History', syncWatchBatchMutation)
            }}
            disabled={syncWatchHistoryMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
            title="Sync watch history from Tautulli"
          >
            {syncWatchHistoryMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            <span>Sync Watched</span>
          </button>

          {/* Columns Button - only show in list view */}
          {viewMode === 'list' && (
            <div className="relative" ref={columnSettingsRef}>
              <button
                onClick={handleToggleColumnSettings}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                <span>Columns</span>
              </button>
              
              {/* Column Settings Dropdown */}
              {showColumnSettings && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                  <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Toggle Columns</span>
                  </div>
                  <div className="p-2 space-y-1">
                    {AVAILABLE_COLUMNS.filter((col: ColumnDef) => col.id !== 'select').map((col: ColumnDef) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isColumnVisible(col.id)}
                          onChange={() => toggleColumn(col.id)}
                          disabled={col.id === 'title'}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 disabled:opacity-50"
                        />
                        <span className={`text-sm ${isColumnVisible(col.id) ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                          {col.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleResetColumns}
                      className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white py-1 transition-colors"
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Process Status */}
          {processStatus.running && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600/20 border border-yellow-600/50 rounded text-yellow-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{processStatus.label}</span>
            </div>
          )}
        </div>

        {/* Right side - Select All, Rename, Delete (when in edit mode with selections) and Edit button */}
        <div className="flex items-center gap-2">
          {/* Select All / Deselect All Button - only show when in edit mode */}
          {viewMode === 'list' && editMode && (
            <button
              onClick={() => {
                const allCurrentPageIds = movies.map(m => m.id)
                const allSelected = allCurrentPageIds.every(id => selectedIds.has(id))
                if (allSelected) {
                  // Deselect all on current page
                  logger.selection('deselect_all', movies.length, 'Movies')
                  const newSelected = new Set(selectedIds)
                  allCurrentPageIds.forEach(id => newSelected.delete(id))
                  setSelectedIds(newSelected)
                } else {
                  // Select all on current page
                  logger.selection('select_all', movies.length, 'Movies')
                  const newSelected = new Set(selectedIds)
                  allCurrentPageIds.forEach(id => newSelected.add(id))
                  setSelectedIds(newSelected)
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm transition-colors"
              title={movies.every(m => selectedIds.has(m.id)) ? 'Deselect all on this page' : 'Select all on this page'}
            >
              {movies.length > 0 && movies.every(m => selectedIds.has(m.id)) ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Deselect All ({movies.length})</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Select All ({movies.length})</span>
                </>
              )}
            </button>
          )}

          {/* Rename File Button - only show when in edit mode with selections */}
          {viewMode === 'list' && editMode && selectedIds.size > 0 && (
            <button
              onClick={() => {
                logger.buttonClick('Rename Files', 'Movies', { count: selectedIds.size })
                renameFilesMutation.mutate(Array.from(selectedIds))
              }}
              disabled={isAnyProcessRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 rounded text-white text-sm transition-colors"
              title={`Rename ${selectedIds.size} file${selectedIds.size !== 1 ? 's' : ''}`}
            >
              <Edit2 className="w-4 h-4" />
              <span>Rename Files</span>
            </button>
          )}

          {/* Rename Folder Button - only show when in edit mode with selections */}
          {viewMode === 'list' && editMode && selectedIds.size > 0 && (
            <button
              onClick={() => {
                logger.buttonClick('Rename Folders', 'Movies', { count: selectedIds.size })
                renameFoldersMutation.mutate(Array.from(selectedIds))
              }}
              disabled={isAnyProcessRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 rounded text-white text-sm transition-colors"
              title={`Rename ${selectedIds.size} folder${selectedIds.size !== 1 ? 's' : ''}`}
            >
              <FolderEdit className="w-4 h-4" />
              <span>Rename Folders</span>
            </button>
          )}

          {/* Delete Selected Button - only show when in edit mode with selections */}
          {viewMode === 'list' && editMode && selectedIds.size > 0 && (
            <div className="relative group">
              <button
                onClick={() => {
                  logger.buttonClick('Delete', 'Movies', { count: selectedIds.size, mode: 'library_only' })
                  handleDeleteSelected(false, false)
                }}
                disabled={isAnyProcessRunning}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
                title={`Delete ${selectedIds.size} selected movie${selectedIds.size !== 1 ? 's' : ''}`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete ({selectedIds.size})</span>
              </button>
              {/* Dropdown menu for delete options */}
              <div className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                <button
                  onClick={() => handleDeleteSelected(false, false)}
                  disabled={isAnyProcessRunning}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                >
                  Remove from library only
                </button>
                <button
                  onClick={() => handleDeleteSelected(true, false)}
                  disabled={isAnyProcessRunning}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Delete media files
                </button>
                <button
                  onClick={() => handleDeleteSelected(false, true)}
                  disabled={isAnyProcessRunning}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                >
                  Delete entire folders
                </button>
              </div>
            </div>
          )}

          {/* Edit Button - only show in list view */}
          {viewMode === 'list' && (
            <button
              onClick={toggleEditMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                editMode 
                  ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
              }`}
              title={editMode ? 'Exit edit mode' : 'Enter edit mode to select items'}
            >
              <Pencil className="w-4 h-4" />
              <span>{editMode ? 'Done' : 'Edit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'grid' ? (
          <MediaGrid
            items={movies.map(m => ({
              id: m.id,
              title: m.title,
              year: m.year,
              posterUrl: m.poster_path,
              rating: m.rating,
              watched: m.watched,
              watchCount: m.watch_count,
            }))}
            isLoading={isLoading}
            onItemClick={handleMovieClick}
          />
        ) : (
          <MediaList
            movies={movies}
            isLoading={isLoading}
            onItemClick={handleListMovieClick}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            visibleColumns={visibleColumns}
            onColumnsChange={setVisibleColumns}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            editMode={editMode}
          />
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between py-2">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Show:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const newSize = parseInt(e.target.value, 10)
              logger.pageSize(newSize, 'Movies')
              setPageSize(newSize)
              setPage(1) // Reset to first page when changing page size
            }}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-primary-500"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span className="text-gray-400 text-sm">per page</span>
          <span className="text-gray-500 text-sm ml-2">
            ({data?.total || 0} total)
          </span>
        </div>

        {/* Page Navigation */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newPage = Math.max(1, page - 1)
                logger.pagination(newPage, totalPages, 'Movies')
                setPage(newPage)
              }}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => {
                const newPage = Math.min(totalPages, page + 1)
                logger.pagination(newPage, totalPages, 'Movies')
                setPage(newPage)
              }}
              disabled={page === totalPages}
              className="px-4 py-2 bg-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Spacer for layout balance when no pagination */}
        {totalPages <= 1 && <div />}
      </div>

      {/* Movie Detail Modal */}
      {selectedMovie && (
        <MovieDetail
          movieId={selectedMovie.id}
          initialMovie={selectedMovie}
          onClose={() => {
            logger.modal('close', 'MovieDetail', 'Movies')
            setSelectedMovie(null)
          }}
          onPrev={(() => {
            const idx = movies.findIndex(m => m.id === selectedMovie.id)
            if (idx > 0) {
              return () => {
                const prev = movies[idx - 1]
                logger.uiInteraction('movie-navigate', 'prev', 'Movies')
                setSelectedMovie(prev)
              }
            }
            return undefined
          })()}
          onNext={(() => {
            const idx = movies.findIndex(m => m.id === selectedMovie.id)
            if (idx !== -1 && idx < movies.length - 1) {
              return () => {
                const next = movies[idx + 1]
                logger.uiInteraction('movie-navigate', 'next', 'Movies')
                setSelectedMovie(next)
              }
            }
            return undefined
          })()}
        />
      )}

      {/* Message Modal */}
      <MessageModal
        isOpen={messageState.isOpen}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onClose={hideMessage}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Movies"
        message={`Are you sure you want to delete ${selectedIds.size} movie${selectedIds.size !== 1 ? 's' : ''}?\n\n${
          deleteOptions.deleteFolder 
            ? '⚠️ This will permanently delete the entire folder containing each movie from your disk!'
            : deleteOptions.deleteFile 
              ? '⚠️ This will permanently delete the media files from your disk!'
              : 'This will only remove them from the library. The files will remain on disk.'
        }`}
        confirmLabel={deleteOptions.deleteFolder || deleteOptions.deleteFile ? 'Delete Files' : 'Remove from Library'}
        variant={deleteOptions.deleteFolder || deleteOptions.deleteFile ? 'danger' : 'warning'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* Scope Confirmation Modal for batch actions (page vs all matches) */}
      <ConfirmDialog
        isOpen={scopeModal.isOpen}
        title={scopeModal.actionName ? scopeModal.actionName : 'Confirm'}
        message={
          scopeModal.actionName
            ? `Apply ${scopeModal.actionName} to all ${scopeModal.total} matching movies, or only the filtered results (${scopeModal.currentCount})?` 
            : ''
        }
        confirmLabel={scopeModal.actionName ? `Apply to All (${scopeModal.total})` : 'Apply to All'}
        cancelLabel={`Apply to Filtered (${scopeModal.currentCount})`}
        variant={'info'}
        requireAcknowledgement={Boolean((scopeModal.total ?? 0) > 500)}
        acknowledgementLabel={(scopeModal.total ?? 0) > 500 ? `This will run for ${scopeModal.total ?? 0} movies and may take a long time. Please check server load and make sure you want to proceed.` : undefined}
        // When user confirms, we call the configured handler which now starts per-item processing
        onConfirm={() => scopeModal.onConfirmAll && scopeModal.onConfirmAll()}
        // If an operation is running for this action, treat cancel as a stop request; otherwise apply to page
        onCancel={() => {
          if (batchProgress && batchProgress.actionName === scopeModal.actionName) {
            cancelRequestedRef.current = true
          } else {
            scopeModal.onConfirmPage && scopeModal.onConfirmPage()
          }
        }}
        onClose={() => setScopeModal(s => ({ ...s, isOpen: false }))}
        isLoading={Boolean(batchProgress) && batchProgress?.actionName === scopeModal.actionName}
        progress={batchProgress && batchProgress.actionName === scopeModal.actionName ? batchProgress : null}
      />
    </div>
  )

}
