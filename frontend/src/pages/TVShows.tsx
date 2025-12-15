import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Filter, SortAsc, SortDesc, Search, RefreshCw, Loader2 } from 'lucide-react'
import MediaGrid from '../components/MediaGrid'
import MessageModal, { useMessageModal } from '../components/MessageModal'
import { tvShowsApi, libraryApi, TVShow } from '../services/api'
import logger from '../services/logger'

export default function TVShows() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { messageState, showMessage, hideMessage } = useMessageModal()

  // Log page view on mount
  useEffect(() => {
    logger.pageView('TVShows')
  }, [])

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tvshows', page, sortBy, sortOrder, searchQuery],
    queryFn: () => tvShowsApi.getTVShows({
      page,
      page_size: 50,
      sort_by: sortBy,
      sort_order: sortOrder,
      search: searchQuery || undefined,
    }).then(res => res.data),
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
        showMessage(
          'Refresh Complete',
          `• Removed ${removedEps} missing episodes\n• Added ${addedShows} new shows, ${addedEps} new episodes`,
          'success'
        )
      } else {
        showMessage('Library Up to Date', 'No changes found in your TV show library.', 'info')
      }
    },
    onError: (error: any) => {
      logger.error('Refresh library failed', 'TVShows', { error: error?.response?.data?.detail || error?.message })
      showMessage('Refresh Failed', error?.response?.data?.detail || 'Failed to refresh library', 'error')
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">TV Shows</h1>
        
        <div className="flex items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search TV shows..."
              className="w-64 pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
          </form>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => handleSortByChange(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="title">Title</option>
              <option value="first_air_date">First Aired</option>
              <option value="rating">Rating</option>
              <option value="added">Date Added</option>
            </select>
            <button
              onClick={toggleSortOrder}
              className="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-300 hover:text-gray-900 dark:text-white hover:bg-gray-600 transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? <SortAsc className="w-5 h-5" /> : <SortDesc className="w-5 h-5" />}
            </button>
          </div>
          
          {/* Refresh Library Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 rounded-lg text-gray-900 dark:text-white text-sm transition-colors"
            title="Refresh library: remove missing files and add new ones"
          >
            {refreshMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>{refreshMutation.isPending ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          
          {/* Filter Button */}
          <button className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-300 hover:text-gray-900 dark:text-white hover:bg-gray-600 transition-colors">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filters</span>
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="mb-4 text-gray-500 dark:text-gray-400 text-sm">
        {data && (
          <span>Showing {shows.length} of {data.total} TV shows</span>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0">
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

