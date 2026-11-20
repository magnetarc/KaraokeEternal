import React from 'react'
import styles from '../views/ModernLibrary.css'
export default function BrowsePagination ({ page, pages, onChange, busy = false, label }: { page: number, pages: number, onChange(page: number): void, busy?: boolean, label: string }) {
  if (pages <= 1) return null
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button disabled={busy || page <= 0} onClick={() => onChange(page - 1)}>Previous</button>
      <span>{`Page ${page + 1} of ${pages.toLocaleString()}`}</span>
      <button disabled={busy || page + 1 >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  )
}
