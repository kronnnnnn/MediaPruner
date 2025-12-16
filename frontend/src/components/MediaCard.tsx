import { Film, Tv, CheckCircle } from 'lucide-react'

interface MediaCardProps {
  title: string
  year?: number | string
  posterUrl?: string
  rating?: number
  mediaType?: 'movie' | 'tv'
  watched?: boolean
  watchCount?: number
  onClick?: () => void
}

export default function MediaCard({ title, year, posterUrl, rating, mediaType = 'movie', watched, watchCount, onClick }: MediaCardProps) {
  const PlaceholderIcon = mediaType === 'tv' ? Tv : Film
  
  return (
    <div 
      className="group relative bg-white dark:bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary-500 shadow-sm dark:shadow-none transition-all"
      onClick={onClick}
    >
      <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
            <PlaceholderIcon className="w-8 h-8" />
          </div>
        )}
      </div>
      
      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <h3 className="text-white font-semibold text-xs line-clamp-2">{title}</h3>
          {year && <p className="text-gray-300 text-xs mt-0.5">{year}</p>}
        </div>
      </div>
      
      {/* Watch status badge (top left) */}
      {watched && (
        <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-green-600/90 text-white text-xs font-medium px-1.5 py-0.5 rounded">
          <CheckCircle className="w-3 h-3" />
          {watchCount && watchCount > 1 && <span>{watchCount}x</span>}
        </div>
      )}
      
      {/* Rating badge */}
      {rating && (
        <div className="absolute top-1 right-1 bg-black/70 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded">
          ★ {rating.toFixed(1)}
        </div>
      )}
      
      {/* Title below (always visible) */}
      <div className="p-1.5 bg-white dark:bg-gray-800">
        <h3 className="text-gray-900 dark:text-white font-medium text-xs line-clamp-1">{title}</h3>
        {year && <p className="text-gray-500 dark:text-gray-400 text-xs">{year}</p>}
      </div>
    </div>
  )
}
