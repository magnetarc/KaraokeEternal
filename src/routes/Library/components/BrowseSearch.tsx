import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import styles from '../views/ModernLibrary.css'

// Keep editing local: changing the URL can filter/sort tens of thousands of
// songs. That work must not control the input after every individual key.
export default function BrowseSearch ({ query, onSearch, inputRef, label, clearLabel }: {
  query: string
  onSearch(query: string): void
  inputRef: React.RefObject<HTMLInputElement | null>
  label: string
  clearLabel: string
}) {
  const location = useLocation()
  const [draft, setDraft] = useState(query)
  const valueRef = useRef(query)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const composingRef = useRef(false)
  const submittedRef = useRef(new Set<string>())
  const searchRef = useRef(onSearch)
  useLayoutEffect(() => {
    searchRef.current = onSearch
  }, [onSearch])
  useLayoutEffect(() => {
    // Our own URL update acknowledges a search; it must not overwrite text
    // entered since submission. Back/Forward and category navigation do reset it.
    if (submittedRef.current.delete(query)) return
    clearTimeout(timerRef.current)
    valueRef.current = query
    setDraft(query)
  }, [query, location.key])
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const commit = (next: string) => {
    clearTimeout(timerRef.current)
    if (next === query && !submittedRef.current.size) return
    submittedRef.current.add(next)
    searchRef.current(next)
  }
  const edit = (next: string) => {
    valueRef.current = next
    setDraft(next)
    clearTimeout(timerRef.current)
    if (composingRef.current) return
    if (!next) commit(next)
    else timerRef.current = setTimeout(() => commit(next), 300)
  }
  return (
    <div className={styles.searchbox}>
      <span aria-hidden='true'>⌕</span>
      <input
        ref={inputRef}
        type='search'
        aria-label={label}
        placeholder='Search songs or artists'
        value={draft}
        onChange={event => edit(event.target.value)}
        onCompositionStart={() => {
          composingRef.current = true
          clearTimeout(timerRef.current)
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false
          edit(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composingRef.current) {
            event.preventDefault()
            commit(valueRef.current)
          }
        }}
      />
      {draft && (
        <button
          aria-label={clearLabel}
          onClick={() => {
            composingRef.current = false
            edit('')
            inputRef.current?.focus()
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
