/**
 * Frontend Logging Service
 * Captures all user interactions and sends them to the backend
 */
import api from './api'

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

// Log categories for organizing events
export type LogCategory = 
  | 'navigation'  // Page views, route changes
  | 'action'      // Button clicks, form submissions
  | 'filter'      // Filter changes
  | 'sort'        // Sort changes
  | 'selection'   // Item selection/deselection
  | 'search'      // Search queries
  | 'ui'          // UI interactions (modals, dropdowns, etc.)
  | 'data'        // Data operations (fetch, refresh, etc.)
  | 'error'       // Errors

interface LogEntry {
  level: LogLevel
  category: LogCategory
  action: string
  details?: string
  component?: string
  page?: string
  metadata?: Record<string, unknown>
  timestamp: number
}

// Queue for batching logs
let logQueue: LogEntry[] = []
let flushTimeout: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 5000 // Flush every 5 seconds
const MAX_QUEUE_SIZE = 20 // Or when queue reaches this size

// Get current page from URL
function getCurrentPage(): string {
  const path = window.location.pathname
  if (path === '/' || path === '') return 'Dashboard'
  if (path.includes('/movies')) return 'Movies'
  if (path.includes('/tvshows')) return 'TVShows'
  if (path.includes('/settings')) return 'Settings'
  return path
}

// Flush logs to backend
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) return
  
  const logsToSend = [...logQueue]
  logQueue = []
  
  try {
    await api.post('/settings/logs/frontend/batch', {
      logs: logsToSend.map(log => ({
        level: log.level,
        category: log.category,
        action: log.action,
        details: log.details,
        component: log.component,
        page: log.page,
        metadata: log.metadata,
      }))
    })
  } catch (error) {
    // If flush fails, put logs back in queue (but limit to prevent memory issues)
    logQueue = [...logsToSend.slice(-MAX_QUEUE_SIZE), ...logQueue].slice(-MAX_QUEUE_SIZE * 2)
    console.error('Failed to flush logs:', error)
  }
}

// Schedule flush
function scheduleFlush(): void {
  if (flushTimeout) return
  flushTimeout = setTimeout(() => {
    flushTimeout = null
    flushLogs()
  }, FLUSH_INTERVAL)
}

// Add log to queue
function queueLog(entry: Omit<LogEntry, 'timestamp'>): void {
  logQueue.push({
    ...entry,
    timestamp: Date.now(),
  })
  
  // Flush immediately if queue is full
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    if (flushTimeout) {
      clearTimeout(flushTimeout)
      flushTimeout = null
    }
    flushLogs()
  } else {
    scheduleFlush()
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logQueue.length > 0) {
      // Use sendBeacon for reliable delivery on page unload
      const data = JSON.stringify({
        logs: logQueue.map(log => ({
          level: log.level,
          category: log.category,
          action: log.action,
          details: log.details,
          component: log.component,
          page: log.page,
          metadata: log.metadata,
        }))
      })
      navigator.sendBeacon('/api/settings/logs/frontend/batch', new Blob([data], { type: 'application/json' }))
    }
  })
}

// ================== Public Logging Functions ==================

/**
 * Log a page view / navigation event
 */
export function logPageView(page: string, details?: string): void {
  queueLog({
    level: 'INFO',
    category: 'navigation',
    action: 'page_view',
    page,
    details,
  })
}

/**
 * Log a button click
 */
export function logButtonClick(buttonName: string, component?: string, metadata?: Record<string, unknown>): void {
  queueLog({
    level: 'INFO',
    category: 'action',
    action: 'button_click',
    details: buttonName,
    component,
    page: getCurrentPage(),
    metadata,
  })
}

/**
 * Log a filter change
 */
export function logFilterChange(filterName: string, value: unknown, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'filter',
    action: 'filter_change',
    details: `${filterName}: ${JSON.stringify(value)}`,
    component,
    page: getCurrentPage(),
    metadata: { filter: filterName, value },
  })
}

/**
 * Log a sort change
 */
export function logSortChange(sortBy: string, sortOrder: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'sort',
    action: 'sort_change',
    details: `${sortBy} ${sortOrder}`,
    component,
    page: getCurrentPage(),
    metadata: { sortBy, sortOrder },
  })
}

/**
 * Log a search query
 */
export function logSearch(query: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'search',
    action: 'search',
    details: query || '(cleared)',
    component,
    page: getCurrentPage(),
  })
}

/**
 * Log item selection
 */
export function logSelection(action: 'select' | 'deselect' | 'select_all' | 'deselect_all', count: number, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'selection',
    action,
    details: `${count} item(s)`,
    component,
    page: getCurrentPage(),
    metadata: { count },
  })
}

/**
 * Log UI interaction (modal open/close, dropdown, etc.)
 */
export function logUIInteraction(action: string, element: string, component?: string, metadata?: Record<string, unknown>): void {
  queueLog({
    level: 'INFO',
    category: 'ui',
    action,
    details: element,
    component,
    page: getCurrentPage(),
    metadata,
  })
}

/**
 * Log data operation (fetch, refresh, save, delete, etc.)
 */
export function logDataOperation(operation: string, details?: string, component?: string, metadata?: Record<string, unknown>): void {
  queueLog({
    level: 'INFO',
    category: 'data',
    action: operation,
    details,
    component,
    page: getCurrentPage(),
    metadata,
  })
}

/**
 * Log view mode change
 */
export function logViewModeChange(mode: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'ui',
    action: 'view_mode_change',
    details: mode,
    component,
    page: getCurrentPage(),
  })
}

/**
 * Log page size change
 */
export function logPageSizeChange(size: number, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'ui',
    action: 'page_size_change',
    details: `${size} items per page`,
    component,
    page: getCurrentPage(),
    metadata: { pageSize: size },
  })
}

/**
 * Log pagination
 */
export function logPagination(page: number, totalPages: number, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'navigation',
    action: 'page_change',
    details: `Page ${page} of ${totalPages}`,
    component,
    page: getCurrentPage(),
    metadata: { page, totalPages },
  })
}

/**
 * Log an error with enhanced details including stack trace
 */
export function logError(error: string, component?: string, metadata?: Record<string, unknown>): void {
  // Try to extract stack trace if metadata contains an error object
  const enhancedMetadata = { ...metadata }
  
  // If metadata contains an error object, extract useful information
  if (metadata?.error) {
    const err = metadata.error as any
    if (err instanceof Error) {
      enhancedMetadata.errorName = err.name
      enhancedMetadata.errorMessage = err.message
      enhancedMetadata.stack = err.stack
    } else if (typeof err === 'object') {
      // Handle axios or API errors
      if (err.response) {
        enhancedMetadata.statusCode = err.response.status
        enhancedMetadata.statusText = err.response.statusText
        enhancedMetadata.responseData = err.response.data
        enhancedMetadata.url = err.config?.url
        enhancedMetadata.method = err.config?.method
      }
      if (err.stack) {
        enhancedMetadata.stack = err.stack
      }
      // Capture any other error properties
      enhancedMetadata.errorDetails = JSON.stringify(err, null, 2).substring(0, 1000)
    }
  }
  
  // Capture current stack trace if not already present
  if (!enhancedMetadata.stack) {
    try {
      throw new Error('Stack trace')
    } catch (e: any) {
      enhancedMetadata.stack = e.stack
    }
  }
  
  queueLog({
    level: 'ERROR',
    category: 'error',
    action: 'error',
    details: error,
    component,
    page: getCurrentPage(),
    metadata: enhancedMetadata,
  })
}

/**
 * Log a warning
 */
export function logWarning(warning: string, component?: string, metadata?: Record<string, unknown>): void {
  queueLog({
    level: 'WARNING',
    category: 'error',
    action: 'warning',
    details: warning,
    component,
    page: getCurrentPage(),
    metadata,
  })
}

/**
 * Log edit mode toggle
 */
export function logEditMode(enabled: boolean, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'ui',
    action: 'edit_mode_toggle',
    details: enabled ? 'enabled' : 'disabled',
    component,
    page: getCurrentPage(),
  })
}

/**
 * Log modal open/close
 */
export function logModal(action: 'open' | 'close', modalName: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'ui',
    action: `modal_${action}`,
    details: modalName,
    component,
    page: getCurrentPage(),
  })
}

/**
 * Log tab change
 */
export function logTabChange(tabName: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'navigation',
    action: 'tab_change',
    details: tabName,
    component,
    page: getCurrentPage(),
  })
}

/**
 * Log a navigation event
 */
export function logNavigation(path: string, label: string, component?: string): void {
  queueLog({
    level: 'INFO',
    category: 'navigation',
    action: 'navigate',
    details: `${label} (${path})`,
    component,
    page: getCurrentPage(),
    metadata: { path, label },
  })
}

/**
 * Force flush all pending logs (useful before navigation)
 */
export function forceFlush(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout)
    flushTimeout = null
  }
  return flushLogs()
}

// Default export for convenience
const logger = {
  pageView: logPageView,
  buttonClick: logButtonClick,
  filterChange: logFilterChange,
  sortChange: logSortChange,
  search: logSearch,
  selection: logSelection,
  uiInteraction: logUIInteraction,
  dataOperation: logDataOperation,
  viewMode: logViewModeChange,
  pageSize: logPageSizeChange,
  pagination: logPagination,
  error: logError,
  warning: logWarning,
  editMode: logEditMode,
  modal: logModal,
  tabChange: logTabChange,
  navigation: logNavigation,
  flush: forceFlush,
}

export default logger
