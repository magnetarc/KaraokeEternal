import { useLayoutEffect, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'

const positions = new Map<string, number>()
export default function useBrowseState<T extends Record<string, string | boolean | number>> (defaults: T, containerRef: React.RefObject<HTMLElement | null>) {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => Object.fromEntries(Object.entries(defaults).map(([key, value]) => {
    let raw = params.get(key)
    if (key === 'mode' && !['cards', 'search'].includes(raw)) raw = null
    if (key === 'sort' && !['popular', 'title', 'artist', 'duration'].includes(raw)) raw = null
    return [key, raw === null ? value : typeof value === 'boolean' ? raw === '1' : typeof value === 'number' ? Math.max(0, Math.min(1000000, Math.floor(Number(raw) || 0))) : raw]
  })) as T, [params, defaults])
  const change = (patch: Partial<T>, replace = false) => setParams((previous) => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(patch)) {
      if (value === defaults[key] || value === '' || value === false) next.delete(key)
      else next.set(key, value === true ? '1' : String(value))
    }
    return next
  }, { replace })
  const key = location.pathname + location.search
  useLayoutEffect(() => {
    containerRef.current?.scrollTo({ top: positions.get(key) ?? 0 })
  }, [key, containerRef])
  const onScroll = () => {
    if (containerRef.current) positions.set(key, containerRef.current.scrollTop)
    if (positions.size > 100) positions.delete(positions.keys().next().value)
  }
  return { state, change, onScroll }
}
