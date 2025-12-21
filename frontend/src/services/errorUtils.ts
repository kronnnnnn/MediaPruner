export function errorDetail(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const resp = (e as Record<string, unknown>)?.response as Record<string, unknown> | undefined
    const data = resp?.data as Record<string, unknown> | undefined
    if (data && typeof data.detail === 'string') return data.detail
    const msg = (e as Record<string, unknown>)?.message as string | undefined
    if (typeof msg === 'string') return msg
    try { return JSON.stringify(e) } catch { return String(e) }
  }
  return String(e)
}
