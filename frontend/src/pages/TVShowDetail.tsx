import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, RefreshCw, Edit2, FileText, Star, ChevronDown, ChevronUp,
  HardDrive, Tv, Loader2, Check, X, Subtitles, FileVideo
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tvShowsApi, Episode } from '../services/api'
import MessageModal, { useMessageModal } from '../components/MessageModal'
import TVRenameModal from '../components/TVRenameModal'
import MuxConfirmDialog from '../components/MuxConfirmDialog'
import { useToast } from '../contexts/ToastContext'
import logger from '../services/logger'
import { errorDetail } from '../services/errorUtils'

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

// Format file size
const formatFileSize = (bytes?: number) => {
  if (!bytes) return null
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function TVShowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { messageState, showMessage, hideMessage } = useMessageModal()
  const { showToast } = useToast()
  const showId = parseInt(id || '0')

  // Log page view
  useEffect(() => {
    if (showId) {
      logger.pageView('TVShowDetail', `Show ID: ${showId}`)
    }
  }, [showId])

  const [expandedSeason, setExpandedSeason] = useState<number | null>(null)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [showMuxConfirm, setShowMuxConfirm] = useState(false)
  const [muxPreview, setMuxPreview] = useState<any>(null)
  const [muxPreviewError, setMuxPreviewError] = useState<string | null>(null)
  const [muxProgress, setMuxProgress] = useState<{ current: number; total: number } | null>(null)
  const [isMuxing, setIsMuxing] = useState(false)
  const [metadataProvider, setMetadataProvider] = useState<'auto' | 'tmdb' | 'omdb'>('auto')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searchProvider, setSearchProvider] = useState<'tmdb' | 'omdb' | null>(null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null)
  const [manualTitle, setManualTitle] = useState<string>('')
  const [manualYear, setManualYear] = useState<string>('')
  const seasonRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Fetch show details
  const { data: show, isLoading: showLoading, error: showError } = useQuery({
    queryKey: ['tvshow', showId],
    queryFn: () => tvShowsApi.getTVShow(showId).then(res => res.data),
    enabled: !!showId,
  })

  // Fetch episodes
  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ['episodes', showId],
    queryFn: () => tvShowsApi.getEpisodes(showId).then(res => res.data),
    enabled: !!showId,
  })

  // Scrape show mutation (also scrapes episodes)
  const scrapeMutation = useMutation({
    mutationFn: (provider?: 'tmdb' | 'omdb') => tvShowsApi.scrapeTVShow(showId, undefined, provider),
    onSuccess: async (result: unknown) => {
      const data = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      if (data?.task_id) {
        // Enqueued
        showToast('Refresh Enqueued', `Task ${(data.task_id as string)} enqueued to refresh show metadata`, 'info')
        logger.dataOperation('refresh_metadata', 'enqueued', 'TVShowDetail', { showId, task_id: data.task_id })
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['tvshow', showId] })
      await queryClient.invalidateQueries({ queryKey: ['tvshows'] })
      await queryClient.invalidateQueries({ queryKey: ['episodes', showId] })
      logger.dataOperation('refresh_metadata', 'success', 'TVShowDetail', { 
        showId, 
        source: data?.source,
        episodesUpdated: data?.episodes_updated 
      })
      const episodeSource = data?.episode_source ? ` (episodes from ${data.episode_source.toUpperCase()})` : ''
      const episodeMsg = data?.episodes_updated ? ` and ${data.episodes_updated} episodes` : ''
      showToast('Metadata Updated', `Show${episodeMsg} metadata has been refreshed from ${data?.source?.toUpperCase() || 'external source'}${episodeSource}.`, 'success')
    },
    onError: (error: any) => {
      logger.error('Refresh metadata failed', 'TVShowDetail', { 
        error,
        showId,
        errorMessage: error?.response?.data?.detail || error?.message 
      })
      showToast('Refresh Failed', error?.response?.data?.detail || 'Failed to refresh metadata', 'error')
    }
  })

  // Generate NFO mutation
  const nfoMutation = useMutation({
    mutationFn: () => tvShowsApi.generateNfo(showId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tvshow', showId] })
      logger.dataOperation('generate_nfo', 'success', 'TVShowDetail', { showId })
      showToast('NFO Generated', 'Show NFO file has been created.', 'success')
    },
    onError: (error: unknown) => {
      const err = (error as Record<string, unknown>)
      logger.error('Generate NFO failed', 'TVShowDetail', { 
        error: err,
        showId,
        errorMessage: (err?.response as Record<string, unknown> | undefined)?.data as string | undefined || (err?.message as string | undefined)
      })
      showToast('NFO Failed', (err?.response as Record<string, unknown> | undefined)?.data as string | undefined || 'Failed to generate NFO', 'error')
    }
  })

  // Analyze all episodes mutation
  const analyzeAllMutation = useMutation({
    mutationFn: () => tvShowsApi.analyzeAllEpisodes(showId),
    onSuccess: async (result: unknown) => {
      await queryClient.invalidateQueries({ queryKey: ['episodes', showId] })
      const data = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined

      // If the backend enqueued a task, it returns a task_id instead of analyzed/total counts
      if (data?.task_id) {
        showToast('Analysis Enqueued', `Task ${data.task_id as string} enqueued to analyze ${data.total_enqueued ?? 'episodes'}`, 'info')
        logger.dataOperation('analyze_episodes', 'enqueued', 'TVShowDetail', { showId, task_id: data.task_id, total_enqueued: data.total_enqueued })
        return
      }

      logger.dataOperation('analyze_episodes', 'success', 'TVShowDetail', { 
        showId, 
        analyzed: data?.analyzed, 
        total: data?.total, 
        errors: data?.errors?.length || 0 
      })
      showToast(
        'Analysis Complete',
        `Analyzed ${data?.analyzed} of ${data?.total} episodes.${data?.errors?.length ? `\n${data?.errors.length} errors occurred.` : ''}`,
        data?.analyzed === data?.total ? 'success' : 'warning'
      )
    },
    onError: (error: unknown) => {
      const err = error as Record<string, unknown>
      logger.error('Analyze episodes failed', 'TVShowDetail', { 
        error: err,
        showId,
        errorMessage: (err?.response as Record<string, unknown> | undefined)?.data as string | undefined || (err?.message as string | undefined)
      })
      showToast('Analysis Failed', (err?.response as Record<string, unknown> | undefined)?.data as string | undefined || 'Failed to analyze episodes', 'error')
    }
  })

  // Mux subtitles - process episodes one by one for progress tracking
  const handleMuxSubtitles = async () => {
    logger.buttonClick('Embed Subtitles', 'TVShowDetail', { showId })
    setMuxPreview(null)
    setMuxPreviewError(null)
    setMuxProgress(null)
    setShowMuxConfirm(true)
    
    try {
      const response = await tvShowsApi.getMuxSubtitlesPreview(showId)
      setMuxPreview(response.data)
    } catch (error: unknown) {
      setMuxPreviewError(errorDetail(error) || 'Failed to get preview')
    }
  }

  const confirmMuxSubtitles = async () => {
    if (!muxPreview?.episodes) return
    
    const episodesToMux = (muxPreview.episodes as unknown[]).filter((ep) => Boolean((ep as Record<string, unknown>).can_mux))
    const total = episodesToMux.length
    
    setIsMuxing(true)
    setMuxProgress({ current: 0, total })
    
    let muxed = 0
    const errors: string[] = []
    
    for (let i = 0; i < episodesToMux.length; i++) {
      const ep = episodesToMux[i]
      setMuxProgress({ current: i + 1, total })
      
      try {
        await tvShowsApi.muxEpisodeSubtitle(showId, ep.episode_id)
        muxed++
      } catch (error: unknown) {
        errors.push(`S${(ep as Record<string, unknown>).season_number}E${(ep as Record<string, unknown>).episode_number}: ${errorDetail(error) || 'Failed'}`)
      }
    }
    
    setIsMuxing(false)
    setMuxProgress(null)
    setShowMuxConfirm(false)
    setMuxPreview(null)
    
    queryClient.invalidateQueries({ queryKey: ['episodes', showId] })
    
    showToast(
      'Subtitles Embedded',
      `Embedded subtitles for ${muxed} of ${total} episodes.${errors.length ? `\n${errors.length} errors occurred.` : ''}`,
      muxed === total ? 'success' : 'warning'
    )
  }

  // Group episodes by season
  const episodesBySeason = episodes?.reduce((acc, ep) => {
    const season = ep.season_number
    if (!acc[season]) acc[season] = []
    acc[season].push(ep)
    return acc
  }, {} as Record<number, Episode[]>) || {}

  const seasonNumbers = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b)

  const handleBack = () => {
    logger.buttonClick('Back to TV Shows', 'TVShowDetail')
    navigate('/tvshows')
  }

  const handleScrapeShow = () => {
    logger.buttonClick('Scrape Show', 'TVShowDetail', { provider: metadataProvider })
    const provider = metadataProvider === 'auto' ? undefined : metadataProvider

    // Preflight search at provider to surface candidates before enqueuing
    setSearching(true)
    setSearchResults(null)
    setSearchProvider((provider as 'tmdb' | 'omdb') || 'tmdb')
    tvShowsApi.searchTVShow(showId, provider as 'tmdb' | 'omdb' | undefined).then(res => {
      const data = (res as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      setSearchResults((data?.results as unknown[]) || [])
      setShowSearchModal(true)
    }).catch((err: unknown) => {
      const e = err as Record<string, unknown>
      // If search fails, fall back to enqueuing and show error toast
      showToast('Search Failed', (e?.response as Record<string, unknown> | undefined)?.data as string | undefined || 'Search failed, enqueuing anyway', 'warning')
      scrapeMutation.mutate(provider)
    }).finally(() => setSearching(false))
  }

  const handleConfirmSearch = async () => {
    // If a candidate selected, enqueue with tmdb_id/imdb_id override
    const provider = metadataProvider === 'auto' ? undefined : metadataProvider
    try {
      let res: unknown = null
      if (selectedCandidate) {
        const body: Record<string, unknown> = {}
        if (selectedCandidate.tmdb_id) body.tmdb_id = selectedCandidate.tmdb_id
        if (selectedCandidate.imdb_id) body.imdb_id = selectedCandidate.imdb_id
        res = await tvShowsApi.scrapeTVShow(showId, body, provider as 'tmdb' | 'omdb' | undefined)
      } else if (manualTitle) {
        const body: Record<string, unknown> = { title: manualTitle }
        if (manualYear) body.year = parseInt(manualYear)
        res = await tvShowsApi.scrapeTVShow(showId, body, provider as 'tmdb' | 'omdb' | undefined)
      } else {
        // No selection - enqueue normally
        res = await tvShowsApi.scrapeTVShow(showId, undefined, provider as 'tmdb' | 'omdb' | undefined)
      }

      const data = (res as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      if (data?.task_id) {
        showToast('Refresh Enqueued', `Task ${data.task_id} enqueued to refresh show metadata`, 'info')
        logger.dataOperation('refresh_metadata', 'enqueued', 'TVShowDetail', { showId, task_id: data.task_id, total_enqueued: data.total_enqueued })
      } else {
        showToast('Refresh Enqueued', `Task enqueued to refresh show metadata`, 'info')
        logger.dataOperation('refresh_metadata', 'enqueued', 'TVShowDetail', { showId })
      }

      setShowSearchModal(false)
    } catch (err: unknown) {
      showMessage('Scrape Failed', errorDetail(err) || 'Failed to enqueue scrape', 'error')
    }
  }

  const handleRenameEpisodes = () => {
    logger.buttonClick('Rename Episodes - Open Modal', 'TVShowDetail')
    setRenameModalOpen(true)
  }

  const handleCloseRenameModal = () => {
    logger.buttonClick('Rename Episodes - Close Modal', 'TVShowDetail')
    setRenameModalOpen(false)
  }

  // Search modal handlers / state for preflight scraping
  const closeSearchModal = () => {
    setShowSearchModal(false)
    setSearchResults(null)
    setSelectedCandidate(null)
    setManualTitle('')
    setManualYear('')
  }

  const handleGenerateNfo = () => {
    logger.buttonClick('Generate NFO', 'TVShowDetail')
    nfoMutation.mutate()
  }

  const handleAnalyzeAll = () => {
    logger.buttonClick('Analyze All Episodes', 'TVShowDetail')
    analyzeAllMutation.mutate()
  }

  const toggleSeasonExpand = (seasonNum: number) => {
    logger.uiInteraction('season', expandedSeason === seasonNum ? 'collapse' : 'expand', 'TVShowDetail', { season: seasonNum })
    const isExpanding = expandedSeason !== seasonNum
    setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)
    
    // Scroll to the top of the season when expanding
    if (isExpanding) {
      setTimeout(() => {
        seasonRefs.current[seasonNum]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  if (showLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  if (showError || !show) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">TV show not found</p>
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to TV Shows
        </button>
      </div>
    )
  }

  const genres = show.genres ? show.genres.split(',').map(g => g.trim()) : []
  const isProcessing = scrapeMutation.isPending || nfoMutation.isPending || analyzeAllMutation.isPending || isMuxing
  
  // Check if any episodes have external subtitles
  const hasExternalSubtitles = episodes?.some(ep => ep.has_subtitle || ep.subtitle_path) || false

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with back button */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <h1 className="text-2xl font-bold text-white truncate">{show.title}</h1>
        {show.status && (
          <span className={`px-2 py-1 rounded text-xs ${
            show.status === 'Ended' ? 'bg-red-500/20 text-red-400' :
            show.status === 'Returning Series' ? 'bg-green-500/20 text-green-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {show.status}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero section with backdrop */}
        {show.backdrop_path && (
          <div className="relative h-64 overflow-hidden rounded-lg mb-6">
            <img
              src={show.backdrop_path}
              alt={show.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
          </div>
        )}

        {/* Show Info */}
        <div className="flex gap-6 mb-6">
          {/* Poster */}
          <div className="flex-shrink-0">
            {show.poster_path ? (
              <img
                src={show.poster_path}
                alt={show.title}
                className="w-48 h-72 object-cover rounded-lg shadow-lg"
              />
            ) : (
              <div className="w-48 h-72 bg-gray-700 rounded-lg flex items-center justify-center">
                <Tv className="w-16 h-16 text-gray-500" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white mb-2">{show.title}</h2>
            {show.original_title && show.original_title !== show.title && (
              <p className="text-gray-400 text-sm mb-2">{show.original_title}</p>
            )}

            <div className="flex items-center gap-4 mb-4 text-gray-400 text-sm">
              {show.first_air_date && <span>{new Date(show.first_air_date).getFullYear()}</span>}
              {show.rating && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <Star className="w-4 h-4 fill-current" />
                  {show.rating.toFixed(1)}
                </span>
              )}
              <span>{show.season_count} Seasons</span>
              <span>{show.episode_count} Episodes</span>
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-3 py-1 bg-gray-700 rounded-full text-xs text-gray-300"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {show.overview && (
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                {show.overview}
              </p>
            )}

            {/* External IDs */}
            <div className="flex gap-4 text-sm text-gray-400">
              {show.tmdb_id && (
                <span>TMDB: {show.tmdb_id}</span>
              )}
              {show.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${show.imdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:text-primary-300"
                >
                  IMDB: {show.imdb_id}
                </a>
              )}
            </div>

            {/* Status indicators */}
            <div className="flex gap-4 mt-4 text-sm">
              <span className={`flex items-center gap-1 ${show.scraped ? 'text-green-400' : 'text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${show.scraped ? 'bg-green-400' : 'bg-gray-500'}`} />
                {show.scraped ? 'Scraped' : 'Not Scraped'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h3 className="text-white font-medium mb-3">Actions</h3>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Provider selector + Refresh button group */}
            <div className="flex items-stretch">
              <select
                value={metadataProvider}
                onChange={(e) => setMetadataProvider(e.target.value as 'auto' | 'tmdb' | 'omdb')}
                disabled={isProcessing}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white rounded-l-lg border-r border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
              >
                <option value="auto">Auto</option>
                <option value="tmdb">TMDB</option>
                <option value="omdb">OMDb</option>
              </select>
              <button
                onClick={handleScrapeShow}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white rounded-r-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${scrapeMutation.isPending ? 'animate-spin' : ''}`} />
                {scrapeMutation.isPending ? 'Refreshing...' : 'Refresh Metadata'}
              </button>
            </div>

            <button
              onClick={handleAnalyzeAll}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <HardDrive className={`w-4 h-4 ${analyzeAllMutation.isPending ? 'animate-spin' : ''}`} />
              {analyzeAllMutation.isPending ? 'Analyzing...' : 'Analyze All Episodes'}
            </button>

            <button
              onClick={handleRenameEpisodes}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Rename Episodes
            </button>

            <button
              onClick={handleGenerateNfo}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              {nfoMutation.isPending ? 'Generating...' : 'Generate NFO'}
            </button>

            {/* Embed Subtitles Button - only show if episodes have external subtitles */}
            {hasExternalSubtitles && (
              <button
                onClick={handleMuxSubtitles}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <FileVideo className="w-4 h-4" />
                {isMuxing ? 'Embedding...' : 'Embed Subtitles'}
              </button>
            )}
          </div>
        </div>

        {/* Seasons & Episodes */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Seasons & Episodes</h3>
            {episodesLoading && <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />}
          </div>
          
          <div className="space-y-2">
            {seasonNumbers.map((seasonNum) => {
              const seasonEpisodes = episodesBySeason[seasonNum].sort((a, b) => a.episode_number - b.episode_number)
              const analyzedCount = seasonEpisodes.filter(ep => ep.media_info_scanned).length
              const externalSubCount = seasonEpisodes.filter(ep => ep.has_subtitle || ep.subtitle_path).length
              const internalSubCount = seasonEpisodes.filter(ep => ep.subtitle_languages && ep.subtitle_languages !== '[]' && ep.subtitle_languages !== '').length
              const totalWithSubs = seasonEpisodes.filter(ep => 
                (ep.has_subtitle || ep.subtitle_path) || 
                (ep.subtitle_languages && ep.subtitle_languages !== '[]' && ep.subtitle_languages !== '')
              ).length
              
              return (
                <div 
                  key={seasonNum} 
                  className="bg-gray-700/50 rounded-lg overflow-hidden"
                  ref={(el) => seasonRefs.current[seasonNum] = el}
                >
                  <button
                    onClick={() => toggleSeasonExpand(seasonNum)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-white font-medium">
                        Season {seasonNum}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {seasonEpisodes.length} episodes
                      </span>
                      {totalWithSubs > 0 && (
                        <span 
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400"
                          title={`${externalSubCount} external, ${internalSubCount} internal`}
                        >
                          <Subtitles className="w-3 h-3" />
                          {totalWithSubs}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        analyzedCount === seasonEpisodes.length 
                          ? 'bg-green-500/20 text-green-400'
                          : analyzedCount > 0
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {analyzedCount}/{seasonEpisodes.length} analyzed
                      </span>
                    </div>
                    {expandedSeason === seasonNum ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSeason === seasonNum && (
                    <div className="border-t border-gray-600">
                      {/* Episode table header */}
                      <div className="grid grid-cols-12 gap-2 p-3 bg-gray-800 text-xs text-gray-400 font-medium">
                        <div className="col-span-1">#</div>
                        <div className="col-span-3">Title</div>
                        <div className="col-span-2">Resolution</div>
                        <div className="col-span-1">Codec</div>
                        <div className="col-span-1">Audio</div>
                        <div className="col-span-1">Size</div>
                        <div className="col-span-1">Duration</div>
                        <div className="col-span-1">Sub</div>
                        <div className="col-span-1">Status</div>
                      </div>
                      
                      {seasonEpisodes.map((ep) => (
                        <div
                          key={ep.id}
                          className="grid grid-cols-12 gap-2 p-3 border-b border-gray-600 last:border-0 hover:bg-gray-700/50 text-sm"
                        >
                          <div className="col-span-1 text-gray-400">
                            E{ep.episode_number.toString().padStart(2, '0')}
                          </div>
                          <div className="col-span-3 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white truncate">{ep.title || `Episode ${ep.episode_number}`}</span>
                              {ep.air_date && (
                                <span className="text-gray-500 text-xs flex-shrink-0">
                                  ({new Date(ep.air_date).toLocaleDateString()})
                                </span>
                              )}
                            </div>
                            {ep.file_name && (
                              <div className="text-gray-500 text-xs truncate mt-0.5" title={ep.file_name}>
                                {ep.file_name}
                              </div>
                            )}
                          </div>
                          <div className="col-span-2 text-gray-400 truncate">
                            {ep.video_resolution || '—'}
                          </div>
                          <div className="col-span-1 text-gray-400 truncate">
                            {ep.video_codec || '—'}
                          </div>
                          <div className="col-span-1 text-gray-400 truncate">
                            {ep.audio_codec || '—'}
                          </div>
                          <div className="col-span-1 text-gray-400">
                            {formatFileSize(ep.file_size) || '—'}
                          </div>
                          <div className="col-span-1">
                            {formatDuration(ep.duration) || '—'}
                          </div>
                          <div className="col-span-1 flex items-center gap-1">
                            {(() => {
                              const hasExternal = ep.has_subtitle || ep.subtitle_path
                              const hasInternal = ep.subtitle_languages && ep.subtitle_languages !== '[]' && ep.subtitle_languages !== ''
                              
                              if (hasExternal && hasInternal) {
                                return (
                                  <span title="External + Internal subtitles" className="flex items-center gap-0.5">
                                    <Subtitles className="w-4 h-4 text-green-400" />
                                    <span className="text-[10px] text-green-400">+</span>
                                  </span>
                                )
                              } else if (hasExternal) {
                                return (
                                  <span title="External subtitle file (.srt)">
                                    <Subtitles className="w-4 h-4 text-blue-400" />
                                  </span>
                                )
                              } else if (hasInternal) {
                                return (
                                  <span title="Internal/embedded subtitles">
                                    <Subtitles className="w-4 h-4 text-yellow-400" />
                                  </span>
                                )
                              }
                              return <span className="text-gray-600">—</span>
                            })()}
                          </div>
                          <div className="col-span-1 flex gap-2">
                            {ep.media_info_scanned ? (
                              <span className="flex items-center gap-1 text-green-400 text-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-gray-500 text-xs">
                                <X className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {seasonNumbers.length === 0 && !episodesLoading && (
              <div className="text-center py-8 text-gray-400">
                No episodes found. Try scanning your library.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message Modal */}
      <MessageModal
        isOpen={messageState.isOpen}
        onClose={hideMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
      />

      {/* Search / selection modal for scraping */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={closeSearchModal} />
          <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold">Search for "{show?.title}" ({searchProvider?.toUpperCase()})</h3>
              <button onClick={closeSearchModal} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4">
              {searching && <div className="text-sm text-gray-400">Searching…</div>}
              {!searching && searchResults && searchResults.length === 0 && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300">No matches were found for the show's title. You can edit the title or year and enqueue anyway.</div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Title override" className="p-2 rounded bg-gray-700 border border-gray-600" />
                    <input value={manualYear} onChange={(e) => setManualYear(e.target.value)} placeholder="Year override" className="p-2 rounded bg-gray-700 border border-gray-600" />
                  </div>
                </div>
              )}
              {!searching && searchResults && searchResults.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-400">Select the best match to use for scraping (or leave none to enqueue as-is):</div>
                  <div className="mt-3 space-y-2">
                    {searchResults.map((r, idx) => (
                      <label key={idx} className={`flex items-center gap-3 p-2 rounded ${selectedCandidate === r ? 'bg-gray-700 border border-gray-600' : 'hover:bg-gray-700/20'}`}>
                        <input type="radio" name="candidate" checked={selectedCandidate === r} onChange={() => setSelectedCandidate(r)} />
                        <div className="flex-1">
                          <div className="text-white font-medium">{r.title} {r.year ? `(${r.year})` : ''}</div>
                          {r.overview && <div className="text-sm text-gray-400 truncate">{r.overview}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end p-4 border-t border-gray-700 gap-3">
              <button onClick={closeSearchModal} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">Cancel</button>
              <button onClick={handleConfirmSearch} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">Enqueue Scrape</button>
            </div>
          </div>
        </div>
      )}

      {/* TV Rename Modal */}
      {renameModalOpen && show && (
        <TVRenameModal
          show={show}
          onClose={handleCloseRenameModal}
        />
      )}

      {/* Mux Subtitles Confirmation Dialog */}
      <MuxConfirmDialog
        isOpen={showMuxConfirm}
        onClose={() => {
          if (!isMuxing) {
            setShowMuxConfirm(false)
            setMuxPreview(null)
            setMuxPreviewError(null)
          }
        }}
        onConfirm={confirmMuxSubtitles}
        isLoading={isMuxing}
        type="tvshow"
        preview={muxPreview}
        error={muxPreviewError}
        progress={muxProgress}
      />
    </div>
  )
}
