import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types
export interface Movie {
  id: number
  title: string
  original_title?: string
  year?: number
  release_date?: string
  runtime?: number
  overview?: string
  tagline?: string
  genres?: string
  poster_path?: string
  backdrop_path?: string
  tmdb_id?: number
  imdb_id?: string
  option_4?: string
  rating_key?: number
  
  // Ratings - TMDB
  rating?: number  // TMDB rating (0-10)
  votes?: number  // TMDB vote count
  
  // Ratings - Additional sources (via OMDb)
  imdb_rating?: number  // IMDB rating (0-10)
  imdb_votes?: number  // IMDB vote count
  rotten_tomatoes_score?: number  // Rotten Tomatoes Tomatometer (0-100)
  rotten_tomatoes_audience?: number  // Rotten Tomatoes Audience Score (0-100)
  metacritic_score?: number  // Metacritic Metascore (0-100)
  
  file_path?: string
  file_name?: string
  folder_name?: string
  file_size?: number
  has_nfo: boolean
  has_trailer: boolean
  scraped: boolean
  media_info_scanned: boolean
  media_info_failed?: boolean
  created_at: string
  updated_at: string
  
  // Release info (parsed from filename)
  release_group?: string
  edition?: string
  quality?: string
  
  // Technical media info
  duration?: number
  video_codec?: string
  video_profile?: string
  video_resolution?: string
  video_width?: number
  video_height?: number
  video_aspect_ratio?: string
  video_bitrate?: number
  video_framerate?: string
  video_hdr?: string
  audio_codec?: string
  audio_channels?: string
  audio_bitrate?: number
  audio_language?: string
  audio_tracks?: string
  subtitle_languages?: string
  subtitle_count?: number
  subtitle_path?: string  // External subtitle file path
  has_subtitle?: boolean  // Has external subtitle file
  container?: string
  overall_bitrate?: number
  
  // Watch history (from Tautulli)
  watched?: boolean
  watch_count?: number
  last_watched_date?: string
  last_watched_user?: string
}

export interface Episode {
  id: number
  tvshow_id: number
  season_number: number
  episode_number: number
  title?: string
  air_date?: string
  overview?: string
  runtime?: number
  still_path?: string
  file_path?: string
  file_name?: string
  file_size: number
  has_nfo: boolean
  media_info_scanned: boolean
  
  // Subtitle file info
  subtitle_path?: string
  has_subtitle: boolean
  
  // Technical media info
  duration?: number
  video_codec?: string
  video_resolution?: string
  video_width?: number
  video_height?: number
  audio_codec?: string
  audio_channels?: string
  audio_language?: string
  subtitle_languages?: string
  container?: string
}

export interface Season {
  id: number
  season_number: number
  name?: string
  overview?: string
  air_date?: string
  poster_path?: string
  episode_count: number
}

export interface TVShow {
  id: number
  title: string
  original_title?: string
  first_air_date?: string
  last_air_date?: string
  status?: string
  overview?: string
  genres?: string
  poster_path?: string
  backdrop_path?: string
  tmdb_id?: number
  tvdb_id?: number
  imdb_id?: string
  rating?: number
  votes?: number
  season_count: number
  episode_count: number
  scraped: boolean
  folder_path: string
  folder_name: string
  seasons: Season[]
  created_at: string
  updated_at: string
}

export interface MediaPath {
  id: number
  path: string
  media_type: 'movie' | 'tv'
  name: string
  exists: boolean
  file_count: number
  created_at: string
}

export interface LibraryStats {
  movies: number
  tvshows: number
  episodes: number
  library_paths: number
}

export interface ScanResult {
  path: string
  media_type: string
  movies_found: number
  tvshows_found: number
  episodes_found: number
  errors: string[]
}

export interface RefreshResult {
  message: string
  removed: {
    movies: number
    episodes: number
  }
  added: {
    movies: number
    tvshows: number
    episodes: number
  }
  errors: string[]
}

// Browse directory response
export interface BrowseItem {
  name: string
  path: string
  is_dir: boolean
}

export interface BrowseResult {
  current_path: string
  parent_path: string | null
  items: BrowseItem[]
}

// Library API
export const libraryApi = {
  getPaths: () => api.get<MediaPath[]>('/library/paths'),
  addPath: (path: string, mediaType: 'movie' | 'tv', name?: string) =>
    api.post<MediaPath>('/library/paths', { path, media_type: mediaType, name }),
  removePath: (pathId: number) => api.delete(`/library/paths/${pathId}`),
  scanPath: (pathId: number) => api.post<ScanResult>(`/library/paths/${pathId}/scan`),
  scan: () => api.post('/library/scan'),
  scanAll: () => api.post('/library/scan'),
  refresh: () => api.post<RefreshResult>('/library/refresh'),
  getStats: () => api.get<LibraryStats>('/library/stats'),
  browse: (path?: string) => api.get<BrowseResult>('/library/browse', { params: { path } }),
}

// Rename types
export interface RenamePreset {
  name: string
  pattern: string
  description: string
}

export interface RenamePreview {
  current_name: string
  new_name: string
  pattern: string
  parsed_info: {
    quality?: string
    resolution?: string
    edition?: string
    release_group?: string
  }
}

export interface EpisodeRenamePreview {
  current_name: string
  new_name: string
  pattern: string
  parsed_info: {
    quality?: string
    resolution?: string
    release_group?: string
    show_title?: string
    season_number?: number
    episode_number?: number
    episode_title?: string
  }
}

export interface FolderRenamePreview extends RenamePreview {
  current_path: string
  new_path: string
}

// Movies API
export const moviesApi = {
  getMovies: (params?: {
    page?: number
    page_size?: number
    search?: string
    genre?: string
    year?: number
    watched?: boolean
    sort_by?: string
    sort_order?: string
  }) => api.get('/movies', { params }),
  getMovieIds: (params: { search?: string; genre?: string; year?: number; watched?: boolean; scraped?: string; analyzed?: string; hasNfo?: string; resolution?: string; minRating?: number; maxRating?: number; minImdbRating?: number; maxImdbRating?: number; minRottenTomatoes?: number; maxRottenTomatoes?: number; minMetacritic?: number; maxMetacritic?: number }) => api.get<{ ids: number[]; total: number }>('/movies/ids/list', { params }),
  getMovie: (id: number) => api.get<Movie>(`/movies/${id}`),
  updateMovie: (id: number, data: Partial<Movie>) => api.patch<Movie>(`/movies/${id}`, data),
  scrapeMovie: (id: number) => api.post(`/movies/${id}/scrape`),
  scrapeAllMovies: () => api.post('/movies/scrape-all'),
  scrapeMoviesBatch: (movieIds: number[]) => api.post('/movies/scrape-batch', { movie_ids: movieIds }),
  analyzeMovie: (id: number) => api.post(`/movies/${id}/analyze`),
  analyzeAllMovies: () => api.post('/movies/analyze-all'),
  analyzeMoviesBatch: (movieIds: number[]) => api.post('/movies/analyze-batch', { movie_ids: movieIds }),
  fetchOmdbRatings: (movieIds?: number[]) => api.post('/movies/fetch-omdb-ratings', { movie_ids: movieIds || null }),
  syncWatchHistoryBatch: (movieIds?: number[]) => api.post('/movies/sync-watch-history-batch', { movie_ids: movieIds || null }),
  getRenamePresets: () => api.get<{ presets: Record<string, RenamePreset>, placeholders: Record<string, string> }>('/movies/rename-presets'),
  previewRename: (id: number, pattern: string) => api.get<RenamePreview>(`/movies/${id}/rename-preview`, { params: { pattern } }),
  renameMovie: (id: number, pattern: string) => api.post(`/movies/${id}/rename`, null, { params: { pattern } }),
  previewFolderRename: (id: number, pattern: string) => api.get<FolderRenamePreview>(`/movies/${id}/rename-folder-preview`, { params: { pattern } }),
  renameFolder: (id: number, pattern: string) => api.post(`/movies/${id}/rename-folder`, null, { params: { pattern } }),
  generateNfo: (id: number) => api.post(`/movies/${id}/nfo`),
  deleteMovie: (id: number, options?: { deleteFile?: boolean; deleteFolder?: boolean }) => 
    api.delete(`/movies/${id}`, { 
      params: { 
        delete_file: options?.deleteFile || false, 
        delete_folder: options?.deleteFolder || false 
      } 
    }),
  deleteMoviesBatch: (movieIds: number[], options?: { deleteFile?: boolean; deleteFolder?: boolean }) => 
    api.post('/movies/delete-batch', { 
      movie_ids: movieIds, 
      delete_file: options?.deleteFile || false, 
      delete_folder: options?.deleteFolder || false 
    }),
  renameMoviesBatch: (movieIds: number[], pattern: string) => 
    api.post('/movies/rename-batch', { movie_ids: movieIds, pattern }),
  renameFoldersBatch: (movieIds: number[], pattern: string) => 
    api.post('/movies/rename-folder-batch', { movie_ids: movieIds, pattern }),
  // Subtitle muxing
  getMuxSubtitlePreview: (id: number) => api.get(`/movies/${id}/mux-subtitle-preview`),
  muxSubtitle: (id: number) => api.post(`/movies/${id}/mux-subtitle`),
  // Watch history sync
  syncWatchHistory: (id: number) => api.post(`/movies/${id}/sync-watch-history`),
  syncAllWatchHistory: () => api.post('/movies/sync-watch-history-all'),
}

// TV Shows API
export const tvShowsApi = {
  getTVShows: (params?: {
    page?: number
    page_size?: number
    search?: string
    genre?: string
    status?: string
    sort_by?: string
    sort_order?: string
  }) => api.get('/tvshows', { params }),
  getTVShow: (id: number) => api.get<TVShow>(`/tvshows/${id}`),
  getEpisodes: (showId: number, season?: number) =>
    api.get<Episode[]>(`/tvshows/${showId}/episodes`, { params: { season } }),
  getSeasons: (showId: number) => api.get<Season[]>(`/tvshows/${showId}/seasons`),
  updateTVShow: (id: number, data: Partial<TVShow>) => api.patch<TVShow>(`/tvshows/${id}`, data),
  scrapeTVShow: (id: number, provider?: 'tmdb' | 'omdb') => 
    api.post(`/tvshows/${id}/scrape`, null, { params: provider ? { provider } : {} }),
  scrapeEpisodes: (id: number, provider?: 'tmdb' | 'omdb') => 
    api.post(`/tvshows/${id}/scrape-episodes`, null, { params: provider ? { provider } : {} }),
  renameTVShow: (id: number, pattern?: string, organizeInSeasonFolder?: boolean, replaceSpacesWith?: string | null) => 
    api.post(`/tvshows/${id}/rename`, null, { 
      params: { 
        episode_pattern: pattern, 
        organize_in_season_folder: organizeInSeasonFolder,
        replace_spaces_with: replaceSpacesWith
      } 
    }),
  getRenamePresets: () => api.get<{ presets: Record<string, RenamePreset>, placeholders: Record<string, string> }>('/tvshows/rename-presets'),
  previewRename: (id: number, pattern: string, replaceSpacesWith?: string | null) => 
    api.get<EpisodeRenamePreview>(`/tvshows/${id}/rename-preview`, { 
      params: { pattern, replace_spaces_with: replaceSpacesWith } 
    }),
  generateNfo: (id: number) => api.post(`/tvshows/${id}/nfo`),
  analyzeAllEpisodes: (id: number) => api.post(`/tvshows/${id}/analyze-all`),
  analyzeEpisode: (showId: number, episodeId: number) => api.post(`/tvshows/${showId}/episodes/${episodeId}/analyze`),
  deleteTVShow: (id: number) => api.delete(`/tvshows/${id}`),
  // Subtitle muxing
  getMuxSubtitlesPreview: (id: number) => api.get(`/tvshows/${id}/mux-subtitles-preview`),
  muxSubtitles: (id: number) => api.post(`/tvshows/${id}/mux-subtitles`),
  getEpisodeMuxPreview: (showId: number, episodeId: number) => api.get(`/tvshows/${showId}/episodes/${episodeId}/mux-subtitle-preview`),
  muxEpisodeSubtitle: (showId: number, episodeId: number) => api.post(`/tvshows/${showId}/episodes/${episodeId}/mux-subtitle`),
}

// Health API
export const healthApi = {
  check: () => api.get('/health'),
}

// Settings API
export interface SettingsStatus {
  tmdb_configured: boolean
}

export interface LogEntry {
  id: number
  timestamp: string
  level: string
  logger_name: string
  message: string
  module?: string
  function?: string
  line_number?: number
  exception?: string
}

export interface LogsResponse {
  logs: LogEntry[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface LogStats {
  debug: number
  info: number
  warning: number
  error: number
  critical: number
  total: number
}

export const settingsApi = {
  getStatus: () => api.get<SettingsStatus>('/settings'),
  // TMDB
  getTmdbKeyStatus: () => api.get<{ configured: boolean }>('/settings/tmdb-api-key/status'),
  setTmdbApiKey: (apiKey: string) => api.put('/settings/tmdb-api-key', { api_key: apiKey }),
  deleteTmdbApiKey: () => api.delete('/settings/tmdb-api-key'),
  verifyTmdbApiKey: (apiKey: string) => api.post<{ valid: boolean }>('/settings/tmdb-api-key/verify', { api_key: apiKey }),
  // OMDb (for IMDB, Rotten Tomatoes, Metacritic ratings)
  getOmdbKeyStatus: () => api.get<{ configured: boolean }>('/settings/omdb-api-key/status'),
  setOmdbApiKey: (apiKey: string) => api.put('/settings/omdb-api-key', { api_key: apiKey }),
  deleteOmdbApiKey: () => api.delete('/settings/omdb-api-key'),
  verifyOmdbApiKey: (apiKey: string) => api.post<{ valid: boolean }>('/settings/omdb-api-key/verify', { api_key: apiKey }),
  // Tautulli
  getTautulliStatus: () => api.get<{ configured: boolean; host?: string }>('/settings/tautulli/status'),
  setTautulliSettings: (host: string, apiKey: string) => api.put('/settings/tautulli', { host, api_key: apiKey }),
  deleteTautulliSettings: () => api.delete('/settings/tautulli'),
  verifyTautulliSettings: (host: string, apiKey: string) => api.post<{ valid: boolean }>('/settings/tautulli/verify', { host, api_key: apiKey }),
  // Plex
  getPlexStatus: () => api.get<{ configured: boolean; host?: string }>('/settings/plex/status'),
  setPlexSettings: (host: string, token: string) => api.put('/settings/plex', { host, token }),
  deletePlexSettings: () => api.delete('/settings/plex'),
  fetchPlexToken: (username: string, password: string, save?: boolean) => api.post('/settings/plex/fetch-token', { username, password, save: !!save }),
  testPlexSettings: (host: string, token: string) => api.post('/settings/plex/test', { host, token }),
  // Logs
  getLogs: (params?: { page?: number; page_size?: number; level?: string; search?: string }) => 
    api.get<LogsResponse>('/settings/logs', { params }),
  getLogStats: () => api.get<LogStats>('/settings/logs/stats'),
  clearLogs: (level?: string) => api.delete('/settings/logs', { params: level ? { level } : undefined }),
}

// Tautulli API
export interface WatchHistoryItem {
  id: number
  date: number  // Unix timestamp
  user: string
  title: string
  year?: number
  media_type: string
  rating_key?: number
  parent_rating_key?: number
  grandparent_rating_key?: number
  parent_media_index?: number  // Season number
  media_index?: number  // Episode number
  watched_status?: number
  percent_complete?: number
  stopped?: number  // Unix timestamp
  duration?: number  // Duration in seconds
}

export interface WatchHistoryResponse {
  total_count: number
  history: WatchHistoryItem[]
}

export const tautulliApi = {
  testConnection: () => api.get('/integrations/tautulli/test-connection'),
  getMovieHistory: (title?: string, year?: number, imdb_id?: string, rating_key?: number) => 
    api.get<WatchHistoryResponse>('/integrations/tautulli/movie-history', { 
      params: { title, year, imdb_id, rating_key } 
    }),
  getTVShowHistory: (title: string, season?: number, episode?: number) => 
    api.get<WatchHistoryResponse>('/integrations/tautulli/tvshow-history', { 
      params: { title, season, episode } 
    }),
  getHistory: (length?: number) => 
    api.get<WatchHistoryResponse>('/integrations/tautulli/history', { 
      params: { length } 
    }),
}

// Plex API
export const plexApi = {
  getRatingKeyByImdb: (imdb_id: string) => api.get<{ rating_key: number | null }>(`/integrations/plex/rating-key`, { params: { imdb_id } }),
  rawSearch: (query: string) => api.get<{ results: any[] }>(`/integrations/plex/raw-search`, { params: { query } }),
  getMetadata: (rating_key: number) => api.get<{ metadata: any }>(`/integrations/plex/metadata`, { params: { rating_key } }),
}

export default api
