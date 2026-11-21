import React from 'react'
import { Link } from 'react-router'
import styles from '../views/ModernLibrary.css'
export default function BrowserBar ({ children, isAdmin, book = false, category, onCategories }: { children: React.ReactNode, isAdmin: boolean, book?: boolean, category?: string, onCategories?(): void }) {
  return (
    <div className={styles.browserBar}>
      <div className={styles.topline}>
        <Link className={styles.brand} to='/library'><strong>Karaoke</strong></Link>
        <nav aria-label='Browser navigation'>
          <Link to='/queue'>Queue</Link>
          <Link to='/account'>Settings</Link>
          <details className={styles.moreMenu} data-menu-popup>
            <summary>More</summary>
            <div>
              <Link to={book ? '/library' : '/songbook'}>{book ? 'Playable library' : 'Full songbook'}</Link>
              <Link to='/library?view=classic'>Original search</Link>
              {isAdmin && <Link to='/catalogue'>Organise library</Link>}
            </div>
          </details>
        </nav>
      </div>
      {children}
      {onCategories && (
        <div className={styles.browseCrumb}>
          <button onClick={onCategories}>All categories</button>
          <strong>{category}</strong>
        </div>
      )}
    </div>
  )
}
