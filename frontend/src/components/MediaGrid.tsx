import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import MediaCard from './MediaCard'

interface MediaItem {
  id: number
  title: string
  year?: number
  posterUrl?: string
  rating?: number
}

interface MediaGridProps {
  items: MediaItem[]
  onItemClick?: (item: MediaItem) => void
  isLoading?: boolean
  mediaType?: 'movie' | 'tv'
}

export default function MediaGrid({ items, onItemClick, isLoading, mediaType = 'movie' }: MediaGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  // Calculate columns based on container width - more columns for smaller cards
  const getColumnCount = () => {
    if (typeof window === 'undefined') return 8
    const width = parentRef.current?.clientWidth || window.innerWidth
    if (width < 480) return 3
    if (width < 640) return 4
    if (width < 768) return 5
    if (width < 1024) return 6
    if (width < 1280) return 7
    if (width < 1536) return 8
    return 10
  }
  
  const columnCount = getColumnCount()
  const rowCount = Math.ceil(items.length / columnCount)
  
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 240, // Adjusted row height for compact cards
    overscan: 2,
  })
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            <div className="mt-1.5 h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }
  
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <span className="text-6xl mb-4">📁</span>
        <p className="text-xl">No media found</p>
        <p className="text-sm mt-2">Add library paths in Settings to get started</p>
      </div>
    )
  }
  
  return (
    <div 
      ref={parentRef}
      className="h-full overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount
          const rowItems = items.slice(startIndex, startIndex + columnCount)
          
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 px-1"
            >
              {rowItems.map((item) => (
                <MediaCard
                  key={item.id}
                  title={item.title}
                  year={item.year}
                  posterUrl={item.posterUrl}
                  rating={item.rating}
                  mediaType={mediaType}
                  onClick={() => onItemClick?.(item)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
