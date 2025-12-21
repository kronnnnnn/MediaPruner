export function errorDetail(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const resp = (e as any).response
    if (resp && typeof resp.data?.detail === 'string') return resp.data.detail
    const msg = (e as any).message
    if (typeof msg === 'string') return msg
    try { return JSON.stringify(e) } catch { return String(e) }
  }
  return String(e)
}
