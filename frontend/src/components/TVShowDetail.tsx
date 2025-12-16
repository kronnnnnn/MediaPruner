import { useState } from 'react'
import { X, RefreshCw, Edit2, FileText, Star, ChevronDown, ChevronUp, Eye, Clock } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tvShowsApi, TVShow, Episode, tautulliApi } from '../services/api'

interface TVShowDetailProps {
  show: TVShow
  onClose: () => void
}

export default function TVShowDetail({ show, onClose }: TVShowDetailProps) {
  const queryClient = useQueryClient()
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null)

  const { data: episodes } = useQuery({
    queryKey: ['episodes', show.id],
    queryFn: () => tvShowsApi.getEpisodes(show.id).then(res => res.data),
  })

  // Fetch watch history from Tautulli (if configured)
  const { data: watchHistory } = useQuery({
    queryKey: ['tvshow-watch-history', show.id, show.title],
    queryFn: async () => {
      if (!show.title) return null
      try {
        const response = await tautulliApi.getTVShowHistory(show.title)
        return response.data
      } catch (error) {
        // Tautulli might not be configured, silently fail
        return null
      }
    },
    enabled: !!show.title,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  const scrapeMutation = useMutation({
    mutationFn: () => tvShowsApi.scrapeTVShow(show.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tvshows'] })
    },
  })

  const scrapeEpisodesMutation = useMutation({
    mutationFn: () => tvShowsApi.scrapeEpisodes(show.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['episodes', show.id] })
    },
  })

  const renameMutation = useMutation({
    mutationFn: () => tvShowsApi.renameTVShow(show.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tvshows'] })
    },
  })

  const nfoMutation = useMutation({
    mutationFn: () => tvShowsApi.generateNfo(show.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tvshows'] })
    },
  })

  const genres = show.genres ? show.genres.split(',').map(g => g.trim()) : []
  
  // Group episodes by season
  const episodesBySeason = episodes?.reduce((acc, ep) => {
    const season = ep.season_number
    if (!acc[season]) acc[season] = []
    acc[season].push(ep)
    return acc
  }, {} as Record<number, Episode[]>) || {}

  const seasonNumbers = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-800 rounded-lg shadow-xl">
        {/* Backdrop */}
        {show.backdrop_path && (
          <div className="relative h-64 overflow-hidden rounded-t-lg">
            <img
              src={show.backdrop_path}
              alt={show.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-800 to-transparent" />
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6 -mt-20 relative">
          <div className="flex gap-6">
            {/* Poster */}
            <div className="flex-shrink-0">
              {show.poster_path ? (
                <img
                  src={show.poster_path}
                  alt={show.title}
                  className="w-40 h-60 object-cover rounded-lg shadow-lg"
                />
              ) : (
                <div className="w-40 h-60 bg-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-4xl">📺</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{show.title}</h2>
              {show.original_title && show.original_title !== show.title && (
                <p className="text-gray-400 text-sm">{show.original_title}</p>
              )}
              
              <div className="flex items-center gap-4 mt-2 text-gray-400 text-sm">
                {show.first_air_date && <span>{new Date(show.first_air_date).getFullYear()}</span>}
                {show.status && (
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    show.status === 'Ended' ? 'bg-red-500/20 text-red-400' :
                    show.status === 'Returning Series' ? 'bg-green-500/20 text-green-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {show.status}
                  </span>
                )}
                {show.rating && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <Star className="w-4 h-4 fill-current" />
                    {show.rating.toFixed(1)}
                  </span>
                )}
              </div>

              <div className="flex gap-4 mt-2 text-sm text-gray-400">
                <span>{show.season_count} Seasons</span>
                <span>{show.episode_count} Episodes</span>
              </div>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-2 py-1 bg-gray-700 rounded-full text-xs text-gray-300"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {show.overview && (
                <p className="mt-4 text-gray-300 text-sm leading-relaxed">
                  {show.overview}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => scrapeMutation.mutate()}
              disabled={scrapeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${scrapeMutation.isPending ? 'animate-spin' : ''}`} />
              {scrapeMutation.isPending ? 'Scraping...' : 'Scrape Show'}
            </button>

            <button
              onClick={() => scrapeEpisodesMutation.mutate()}
              disabled={scrapeEpisodesMutation.isPending || !show.tmdb_id}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${scrapeEpisodesMutation.isPending ? 'animate-spin' : ''}`} />
              {scrapeEpisodesMutation.isPending ? 'Scraping...' : 'Scrape Episodes'}
            </button>
            
            <button
              onClick={() => renameMutation.mutate()}
              disabled={renameMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              {renameMutation.isPending ? 'Renaming...' : 'Rename Episodes'}
            </button>
            
            <button
              onClick={() => nfoMutation.mutate()}
              disabled={nfoMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              {nfoMutation.isPending ? 'Generating...' : 'Generate NFO'}
            </button>
          </div>

          {/* Watch History (Tautulli Integration) */}
          {watchHistory && watchHistory.total_count > 0 && (
            <div className="mt-6 p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-green-400" />
                <h3 className="text-white font-medium">Watch History</h3>
                <span className="text-xs text-gray-400">({watchHistory.total_count} views)</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {watchHistory.history.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm p-2 bg-gray-800 rounded">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-white font-medium truncate">{item.user}</span>
                      {item.parent_media_index !== undefined && item.media_index !== undefined && (
                        <span className="text-gray-400 text-xs">
                          S{item.parent_media_index.toString().padStart(2, '0')}E{item.media_index.toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                      {item.percent_complete !== undefined && (
                        <span className="text-xs">
                          {item.percent_complete}%
                        </span>
                      )}
                      <span className="text-xs whitespace-nowrap">
                        {new Date(item.date * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seasons & Episodes */}
          <div className="mt-6">
            <h3 className="text-white font-medium mb-3">Seasons & Episodes</h3>
            <div className="space-y-2">
              {seasonNumbers.map((seasonNum) => (
                <div key={seasonNum} className="bg-gray-700/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-white font-medium">
                      Season {seasonNum}
                      <span className="text-gray-400 font-normal ml-2">
                        ({episodesBySeason[seasonNum].length} episodes)
                      </span>
                    </span>
                    {expandedSeason === seasonNum ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSeason === seasonNum && (
                    <div className="border-t border-gray-600">
                      {episodesBySeason[seasonNum]
                        .sort((a, b) => a.episode_number - b.episode_number)
                        .map((ep) => (
                          <div
                            key={ep.id}
                            className="flex items-center gap-4 p-3 border-b border-gray-600 last:border-0 hover:bg-gray-700/50"
                          >
                            <span className="w-12 text-center text-gray-400 text-sm">
                              E{ep.episode_number.toString().padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">
                                {ep.title || `Episode ${ep.episode_number}`}
                              </p>
                              {ep.air_date && (
                                <p className="text-gray-500 text-xs">
                                  {new Date(ep.air_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <span className="text-gray-500 text-xs font-mono truncate max-w-[200px]">
                              {ep.file_name}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Status indicators */}
          <div className="mt-4 flex gap-4 text-sm">
            <span className={`flex items-center gap-1 ${show.scraped ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${show.scraped ? 'bg-green-400' : 'bg-gray-500'}`} />
              {show.scraped ? 'Scraped' : 'Not Scraped'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
