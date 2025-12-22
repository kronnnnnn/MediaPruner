import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Filter, SortAsc, SortDesc, Search, RefreshCw, LayoutGrid, List, Star, Check, X, Tv as TvIcon } from 'lucide-react'
import MediaGrid from '../components/MediaGrid'
import MessageModal, { useMessageModal } from '../components/MessageModal'
import { useToast } from '../contexts/ToastContext'
import { tvShowsApi, libraryApi, TVShow } from '../services/api'
import logger from '../services/logger'
import { errorDetail } from '../services/errorUtils'

// Helper function to get status badge class
const getStatusClass = (status: string | undefined | null): string => {
  if (!status) return 'bg-gray-500/20 text-gray-400'
  if (status === 'Ended') return 'bg-red-500/20 text-red-400'
  if (status === 'Returning Series') return 'bg-green-500/20 text-green-400'
  return 'bg-gray-500/20 text-gray-400'
}

// localStorage keys for persistence
const STORAGE_KEY_VIEW_MODE = 'mediapruner_tvshows_view_mode'

type ViewMode = 'grid' | 'list'

export default function TVShows() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { messageState, hideMessage } = useMessageModal()
  const { showToast } = useToast()

  // Log page view on mount
  useEffect(() => {
    logger.pageView('TVShows')
  }, [])

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE)
    return (saved === 'grid' || saved === 'list') ? saved : 'grid'
  })

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode)
  }, [viewMode])

  const { data, isPending: isLoading } = useQuery({
    queryKey: ['tvshows', page, sortBy, sortOrder, searchQuery],
    queryFn: () => tvShowsApi.getTVShows({
      page,
      page_size: 50,
      sort_by: sortBy,
      sort_order: sortOrder,
      search: searchQuery || undefined,
    }).then(res => res.data),
    placeholderData: (previousData) => previousData,
  })

  const refreshMutation = useMutation({
    mutationFn: () => libraryApi.refresh(),
    onSuccess: async (result) => {
      // Invalidate and refetch queries
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
      await queryClient.invalidateQueries({ queryKey: ['library-stats'] })
      const data = result.data
      const removedEps = data.removed.episodes
      const addedShows = data.added.tvshows
      const addedEps = data.added.episodes
      if (removedEps > 0 || addedShows > 0 || addedEps > 0) {
        showToast(
          'Refresh Complete',
          `• Removed ${removedEps} missing episodes\n• Added ${addedShows} new shows, ${addedEps} new episodes`,
          'success'
        )
      } else {
        showToast('Library Up to Date', 'No changes found in your TV show library.', 'info')
      }
    },
    onError: (error: unknown) => {
      const err = errorDetail(error)
      logger.error('Refresh library failed', 'TVShows', { error: err })
      showToast('Refresh Failed', err || 'Failed to refresh library', 'error')
    }
  })

  const shows: TVShow[] = data?.shows || []
  const totalPages = data?.total_pages || 1

  const toggleSortOrder = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    logger.sortChange(sortBy, newOrder, 'TVShows')
    setSortOrder(newOrder)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Require at least 3 characters for search
    const trimmedInput = searchInput.trim()
    if (trimmedInput.length > 0 && trimmedInput.length < 3) {
      showToast('Search Too Short', 'Please enter at least 3 characters to search.', 'info')
      return
    }
    logger.search(searchInput, 'TVShows')
    setSearchQuery(searchInput)
    setPage(1)
  }

  const handleSortByChange = (value: string) => {
    logger.sortChange(value, sortOrder, 'TVShows')
    setSortBy(value)
  }

  const handleShowClick = (item: { id: number }) => {
    logger.navigation(`/tvshows/${item.id}`, 'TVShowDetail', 'TVShows')
    navigate(`/tvshows/${item.id}`)
  }

  const handleRefresh = () => {
    logger.buttonClick('Refresh Library', 'TVShows')
    refreshMutation.mutate()
  }

  const handlePreviousPage = () => {
    logger.pagination(page - 1, totalPages, 'TVShows')
    setPage(p => Math.max(1, p - 1))
  }

  const handleNextPage = () => {
    logger.pagination(page + 1, totalPages, 'TVShows')
    setPage(p => Math.min(totalPages, p + 1))
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Search, Sort, Filter, and Action buttons */}
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
              onChange={(e) => handleSortByChange(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            >
              <option value="title">Title</option>
              <option value="first_air_date">First Aired</option>
              <option value="rating">Rating</option>
              <option value="added">Date Added</option>
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
          <button className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>

          {/* Clear Button - show when search has text */}
          {searchInput.trim() !== '' && (
            <button
              onClick={() => {
                logger.buttonClick('Clear Search', 'TVShows')
                setSearchInput('')
                setSearchQuery('')
              }}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors bg-red-600 hover:bg-red-700 border-red-600 text-white"
              title="Clear search"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
              <span className="bg-white text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                1
              </span>
            </button>
          )}

          {/* Stats - showing count */}
          {data && (
            <div className="ml-auto text-gray-500 dark:text-gray-400 text-sm">
              Showing {shows.length} of {data.total} TV shows
            </div>
          )}
        </div>
      </div>

      {/* Toolbar Row - View Toggle and Actions */}
      <div className="flex items-center justify-between p-2 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors">
        {/* Left side - View Toggle */}
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 transition-colors">
            <button
              onClick={() => {
                logger.viewMode('grid', 'TVShows')
                setViewMode('grid')
              }}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                logger.viewMode('list', 'TVShows')
                setViewMode('list')
              }}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          
          {/* Refresh Library Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 rounded text-white text-sm transition-colors"
            title="Refresh library: remove missing files and add new ones"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          
          {/* Filter Button */}
          <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-600 text-sm transition-colors">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Content - Grid or List View */}
      <div className="flex-1 min-h-0">
        {viewMode === 'grid' ? (
          <MediaGrid
            items={shows.map(s => ({
              id: s.id,
              title: s.title,
              year: s.first_air_date ? parseInt(s.first_air_date.split('-')[0]) : undefined,
              posterUrl: s.poster_path,
              rating: s.rating,
            }))}
            isLoading={isLoading}
            onItemClick={handleShowClick}
            mediaType="tv"
          />
        ) : (
          <div className="h-full overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-14">Poster</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">First Aired</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Rating</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Episodes</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Scraped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {(() => {
                  if (isLoading) {
                    return (
                      <>
                        {Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-3 py-2"><div className="w-10 h-14 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></td>
                            <td className="px-3 py-2"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div></td>
                          </tr>
                        ))}
                      </>
                    )
                  }
                  if (shows.length === 0) return (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                        No TV shows found
                      </td>
                    </tr>
                  )
                  return (
                    <>
                      {shows.map((show) => (
                        <tr
                          key={show.id}
                          onClick={() => handleShowClick({ id: show.id })}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                      <td className="px-3 py-2">
                        {show.poster_path ? (
                          <img 
                            src={show.poster_path} 
                            alt={show.title}
                            className="w-10 h-14 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-gray-700 rounded flex items-center justify-center">
                            <TvIcon className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-white truncate max-w-md" title={show.title}>
                          {show.title}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">
                        {show.first_air_date ? new Date(show.first_air_date).getFullYear() : '-'}
                      </td>
                      <td className="px-3 py-2">
                        {show.rating ? (
                          <div className="flex items-center gap-1 text-yellow-400">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="text-sm">{show.rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">
                        {show.season_count} seasons, {show.episode_count} eps
                      </td>
                      <td className="px-3 py-2">
                        {show.status && (
                          <span className={`px-2 py-1 rounded text-xs ${getStatusClass(show.status)}`}>
                            {show.status}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {show.scraped ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <X className="w-4 h-4 text-gray-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                      </>
                    )
              })()}

              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={handlePreviousPage}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-700 rounded-lg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
          >
            Previous
          </button>
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-700 rounded-lg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Message Modal */}
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

