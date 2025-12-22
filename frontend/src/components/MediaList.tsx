import { Movie } from '../services/api'
import { Star, Check, X, Film, Square, CheckSquare } from 'lucide-react'

// Column definitions
export interface ColumnDef {
  id: string
  label: string
  sortable: boolean
  width?: string
  minWidth?: string
  nowrap?: boolean
  defaultVisible: boolean
}

export const AVAILABLE_COLUMNS: ColumnDef[] = [
  { id: 'select', label: '', sortable: false, width: 'w-10', minWidth: 'min-w-[40px]', defaultVisible: true },
  { id: 'poster', label: 'Poster', sortable: false, width: 'w-14', minWidth: 'min-w-[56px]', defaultVisible: true },
  { id: 'title', label: 'Title', sortable: true, minWidth: 'min-w-[150px]', defaultVisible: true },
  { id: 'year', label: 'Year', sortable: true, width: 'w-16', minWidth: 'min-w-[64px]', nowrap: true, defaultVisible: true },
  { id: 'rating', label: 'TMDB', sortable: true, width: 'w-16', minWidth: 'min-w-[64px]', nowrap: true, defaultVisible: true },
  { id: 'imdb_rating', label: 'IMDB', sortable: true, width: 'w-16', minWidth: 'min-w-[64px]', nowrap: true, defaultVisible: false },
  { id: 'rotten_tomatoes_score', label: 'RT', sortable: true, width: 'w-14', minWidth: 'min-w-[56px]', nowrap: true, defaultVisible: false },
  { id: 'metacritic_score', label: 'Meta', sortable: true, width: 'w-14', minWidth: 'min-w-[56px]', nowrap: true, defaultVisible: false },
  { id: 'video_resolution', label: 'Resolution', sortable: true, width: 'w-24', minWidth: 'min-w-[96px]', nowrap: true, defaultVisible: true },
  { id: 'video_codec', label: 'Codec', sortable: true, width: 'w-20', minWidth: 'min-w-[80px]', nowrap: true, defaultVisible: true },
  { id: 'audio_codec', label: 'Audio', sortable: true, width: 'w-24', minWidth: 'min-w-[96px]', nowrap: true, defaultVisible: true },
  { id: 'file_size', label: 'Size', sortable: true, width: 'w-20', minWidth: 'min-w-[80px]', nowrap: true, defaultVisible: true },
  { id: 'duration', label: 'Duration', sortable: true, width: 'w-20', minWidth: 'min-w-[80px]', nowrap: true, defaultVisible: true },
  { id: 'release_group', label: 'Release Group', sortable: true, width: 'w-28', minWidth: 'min-w-[112px]', nowrap: true, defaultVisible: false },
  { id: 'tmdb_id', label: 'TMDB ID', sortable: true, width: 'w-20', minWidth: 'min-w-[80px]', nowrap: true, defaultVisible: false },
  { id: 'imdb_id', label: 'IMDB ID', sortable: true, width: 'w-24', minWidth: 'min-w-[96px]', nowrap: true, defaultVisible: false },
  { id: 'genres', label: 'Genres', sortable: true, width: 'w-36', minWidth: 'min-w-[144px]', defaultVisible: false },
  { id: 'quality', label: 'Quality', sortable: true, width: 'w-20', minWidth: 'min-w-[80px]', nowrap: true, defaultVisible: false },
  { id: 'status', label: 'Status', sortable: false, width: 'w-24', minWidth: 'min-w-[96px]', nowrap: true, defaultVisible: true },
]

// Get default visible columns
export const getDefaultVisibleColumns = (): string[] => 
  AVAILABLE_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)

interface MediaListProps {
  movies: Movie[]
  onItemClick?: (movie: Movie) => void
  isLoading?: boolean
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (column: string) => void
  visibleColumns: string[]
  onColumnsChange: (columns: string[]) => void
  selectedIds?: Set<number>
  onSelectionChange?: (selectedIds: Set<number>) => void
  editMode?: boolean
}

export default function MediaList({ 
  movies, 
  onItemClick, 
  isLoading,
  sortBy,
  sortOrder,
  onSort,
  visibleColumns,
  onColumnsChange: _onColumnsChange,
  selectedIds = new Set(),
}: MediaListProps) {
  // prevent lint 'defined but never used' for optional callback
  void _onColumnsChange;
  onSelectionChange,
  editMode = false,
}: MediaListProps) {
  // prevent lint 'defined but never used' for optional callback
  void _onColumnsChange;
  void onSelectionChange;
  
  const handleSelectAll = () => {
    if (!onSelectionChange) return
    if (selectedIds.size === movies.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(movies.map(m => m.id)))
    }
  }
  
  const handleSelectOne = (movieId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onSelectionChange) return
    const newSet = new Set(selectedIds)
    if (newSet.has(movieId)) {
      newSet.delete(movieId)
    } else {
      newSet.add(movieId)
    }
    onSelectionChange(newSet)
  }
  
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(2)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const isColumnVisible = (columnId: string) => visibleColumns.includes(columnId)

  const SortHeader = ({ column, children, className = '' }: { column: string; children: React.ReactNode; className?: string }) => {
    const colDef = AVAILABLE_COLUMNS.find(c => c.id === column)
    const minWidthClass = colDef?.minWidth || ''
    const nowrapClass = colDef?.nowrap ? 'whitespace-nowrap' : ''
    if (!colDef?.sortable) {
      return (
        <th className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${className} ${minWidthClass} ${nowrapClass}`}>
          {children}
        </th>
      )
    }
    return (
      <th 
        className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-white transition-colors ${className} ${minWidthClass} ${nowrapClass}`}
        onClick={() => onSort(column)}
      >
        <div className="flex items-center gap-1">
          {children}
          {sortBy === column && (
            <span className="text-primary-400">{sortOrder === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
      </th>
    )
  }

  const StatusIcon = ({ active, title }: { active: boolean; title: string }) => (
    <span title={title} className={active ? 'text-green-400' : 'text-gray-600'}>
      {active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
    </span>
  )

  // Render cell content based on column ID
  const renderCell = (movie: Movie, columnId: string) => {
    switch (columnId) {
      case 'select':
        return (
          <div 
            onClick={(e) => handleSelectOne(movie.id, e)}
            className="flex items-center justify-center cursor-pointer"
          >
            {selectedIds.has(movie.id) ? (
              <CheckSquare className="w-5 h-5 text-primary-500" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            )}
          </div>
        )
      
      case 'poster':
        return movie.poster_path ? (
          <img 
            src={movie.poster_path} 
            alt={movie.title}
            className="w-10 h-14 object-cover rounded"
          />
        ) : (
          <div className="w-10 h-14 bg-gray-700 rounded flex items-center justify-center">
            <Film className="w-5 h-5 text-gray-500" />
          </div>
        )
      
      case 'title':
        return (
          <div>
            <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs" title={movie.title}>
              {movie.title}
            </div>
          </div>
        )
      
      case 'year':
        return <span className="text-gray-600 dark:text-gray-300">{movie.year || '-'}</span>
      
      case 'rating':
        return movie.rating ? (
          <div className="flex items-center gap-1 text-yellow-400">
            <Star className="w-3 h-3 fill-current" />
            <span className="text-sm">{movie.rating.toFixed(1)}</span>
          </div>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'imdb_rating':
        return movie.imdb_rating ? (
          <div className="flex items-center gap-1 text-yellow-500">
            <span className="text-sm font-medium">{movie.imdb_rating.toFixed(1)}</span>
          </div>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'rotten_tomatoes_score': {
        if (movie.rotten_tomatoes_score === undefined || movie.rotten_tomatoes_score === null) {
          return <span className="text-gray-500">-</span>
        }
        const rtClass = movie.rotten_tomatoes_score >= 60 ? 'text-red-400' : 'text-green-400'
        return (
          <span className={`text-sm font-medium ${rtClass}`}>
            {movie.rotten_tomatoes_score}%
          </span>
        )
      }
      
      case 'metacritic_score': {
        if (movie.metacritic_score === undefined || movie.metacritic_score === null) {
          return <span className="text-gray-500">-</span>
        }
        let metaClass = 'bg-red-600 text-white'
        if (movie.metacritic_score >= 75) metaClass = 'bg-green-600 text-white'
        else if (movie.metacritic_score >= 50) metaClass = 'bg-yellow-600 text-white'
        return (
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${metaClass}`}>
            {movie.metacritic_score}
          </span>
        )
      }
      
      case 'video_resolution': {
        if (!movie.video_resolution) return <span className="text-gray-500">-</span>
        let resClass = 'bg-gray-600/30 text-gray-300'
        const res = movie.video_resolution
        if (res.includes('2160') || res.includes('4K')) resClass = 'bg-purple-600/30 text-purple-300'
        else if (res.includes('1080')) resClass = 'bg-blue-600/30 text-blue-300'
        else if (res.includes('720')) resClass = 'bg-green-600/30 text-green-300'
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${resClass}`}>
            {res}
          </span>
        )
      }
      
      case 'video_codec':
        return <span className="text-gray-600 dark:text-gray-300 text-sm">{movie.video_codec || '-'}</span>
      
      case 'audio_codec':
        return movie.audio_codec ? (
          <span className="text-gray-600 dark:text-gray-300 text-sm" title={movie.audio_channels || ''}>
            {movie.audio_codec} {movie.audio_channels && `(${movie.audio_channels})`}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'file_size':
        return <span className="text-gray-600 dark:text-gray-300 text-sm">{formatFileSize(movie.file_size)}</span>
      
      case 'duration':
        return <span className="text-gray-600 dark:text-gray-300 text-sm">{formatDuration(movie.duration)}</span>
      
      case 'release_group':
        return movie.release_group ? (
          <span className="px-2 py-0.5 bg-orange-600/30 text-orange-300 rounded text-xs font-medium">
            {movie.release_group}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'tmdb_id':
        return movie.tmdb_id ? (
          <a 
            href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {movie.tmdb_id}
          </a>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'imdb_id':
        return movie.imdb_id ? (
          <a 
            href={`https://www.imdb.com/title/${movie.imdb_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-400 hover:text-yellow-300 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {movie.imdb_id}
          </a>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'genres':
        return movie.genres ? (
          <span className="text-gray-600 dark:text-gray-300 text-sm truncate max-w-[150px]" title={movie.genres}>
            {movie.genres}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'quality':
        return movie.quality ? (
          <span className="px-2 py-0.5 bg-cyan-600/30 text-cyan-300 rounded text-xs font-medium">
            {movie.quality}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )
      
      case 'status':
        return (
          <div className="flex items-center justify-center gap-2">
            <StatusIcon active={movie.scraped} title={movie.scraped ? 'Scraped' : 'Not scraped'} />
            <StatusIcon active={movie.media_info_scanned} title={movie.media_info_scanned ? 'Analyzed' : 'Not analyzed'} />
            <StatusIcon active={movie.has_nfo} title={movie.has_nfo ? 'Has NFO' : 'No NFO'} />
          </div>
        )
      
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
        <div className="animate-pulse">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <span className="text-6xl mb-4">📁</span>
        <p className="text-xl">No media found</p>
        <p className="text-sm mt-2">Add library paths in Settings to get started</p>
      </div>
    )
  }

  // Select column is only visible in edit mode, then filter by visibleColumns for other columns
  const activeColumns = AVAILABLE_COLUMNS.filter(c => {
    if (c.id === 'select') return editMode
    return isColumnVisible(c.id)
  })

  // Render header content - special case for select column
  const renderHeaderContent = (col: ColumnDef) => {
    if (col.id === 'select') {
      const allSelected = movies.length > 0 && selectedIds.size === movies.length
      const someSelected = selectedIds.size > 0 && selectedIds.size < movies.length
      let content: React.ReactNode = <Square className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
      if (allSelected) content = <CheckSquare className="w-5 h-5 text-primary-500" />
      else if (someSelected) content = (
        <div className="relative">
          <Square className="w-5 h-5 text-primary-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2.5 h-0.5 bg-primary-500" />
          </div>
        </div>
      )
      return (
        <div onClick={handleSelectAll} className="flex items-center justify-center cursor-pointer">
          {content}
        </div>
      )
    }
    return col.label
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden flex flex-col h-full border border-gray-200 dark:border-transparent transition-colors">
      {/* Table with sticky header */}
      <div className="overflow-auto flex-1">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {activeColumns.map((col) => (
                col.id === 'select' ? (
                  <th key={col.id} className={`px-3 py-2 ${col.width || ''} ${col.minWidth || ''}`}>
                    {renderHeaderContent(col)}
                  </th>
                ) : (
                  <SortHeader key={col.id} column={col.id} className={col.width || ''}>
                    {renderHeaderContent(col)}
                  </SortHeader>
                )
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {movies.map((movie) => (
              <tr 
                key={movie.id}
                onClick={() => onItemClick?.(movie)}
                className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${selectedIds.has(movie.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
              >
                {activeColumns.map((col) => (
                  <td 
                    key={col.id} 
                    className={`px-3 py-2 ${col.id === 'status' ? 'text-center' : ''} ${col.minWidth || ''} ${col.nowrap ? 'whitespace-nowrap' : ''}`}
                  >
                    {renderCell(movie, col.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
