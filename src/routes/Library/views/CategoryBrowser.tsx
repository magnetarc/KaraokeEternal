import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import Icon from 'components/Icon/Icon'
import type { SongbookOptions, SongbookFilters } from 'shared/songbook'
import styles from './CategoryBrowser.css'

export type CategoryMode = 'cards' | 'search'
type CategoryKey = keyof SongbookOptions
type CategoryFilters = Pick<SongbookFilters, CategoryKey | 'query' | 'untagged'>
type Props = {
  options: SongbookOptions
  filters: CategoryFilters
  mode: CategoryMode
  onModeChange: (mode: CategoryMode) => void
  onChange: (patch: Partial<CategoryFilters>) => void
  onResults: () => void
  onSearch: () => void
  resultsReady: boolean
}

const groups: { key: CategoryKey, label: string }[] = [
  { key: 'genre', label: 'Music styles' }, { key: 'collection', label: 'Collections' },
  { key: 'decade', label: 'Decades' }, { key: 'language', label: 'Languages' }, { key: 'performance', label: 'Voices' },
]
const resetCategories = { genre: '', collection: '', decade: '', language: '', performance: '', query: '', untagged: false }
const styleOrder = ['Pop', 'Rock', 'Country', 'R&B/Soul', 'Dance/Electronic', 'Hip-Hop/Rap', 'Jazz/Swing', 'Musical Theatre']
const collectionOrder = ['Party starters', 'Ballads', 'Family favourites', 'Wedding favourites', 'Musicals', 'Christmas', 'Irish favourites']
const paths = {
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  guitar: 'm14 10 6-6m-4-1 5 5M9 9c2-2 5-1 6 0s1 4-1 6c-1 1-2 1-3 1s-1 2-2 3c-2 2-5 1-6-1s-1-4 1-6c1-1 3-1 3-2s1-1 2-1ZM7 14l3 3',
  headphones: 'M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Z',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8',
  record: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 12a6 6 0 0 1 6-6m0 12a6 6 0 0 0 6-6',
  piano: 'M3 5h18v15H3V5Zm3 0v8h3V5m2 0v8h3V5m2 0v8h3V5M7 13v7m5-7v7m5-7v7',
  film: 'M3 4h18v16H3V4Zm4 0v16M17 4v16M3 8h4m-4 8h4m10-8h4m-4 8h4m-10-7 4 3-4 3V9Z',
  heart: 'M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z',
  party: 'm3 21 4-13 9 9L3 21Zm10-17 1-2m4 6 3-1m-4 5 3 2m-9-8 1 3m4-5 3-2M7 14l3 3',
  people: 'M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20v-3a4 4 0 0 1 8 0v3m4 0v-3a4 4 0 0 1 8 0v3',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  leaf: 'M20 4C8 2 2 9 7 15s14 0 13-11ZM4 21 16 9m-6 6v-5m0 5h5',
  rings: 'M14 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm8 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM8 5 6 2h4L8 5Zm8 0-2-3h4l-2 3Z',
  tree: 'm12 2 6 7h-3l5 7h-6v6h-4v-6H4l5-7H6l6-7Z',
  bolt: 'm14 2-9 12h6l-1 8 9-12h-6l1-8Z',
}
type IconName = keyof typeof paths
type Look = { icon: IconName, tone: string, description: string }
const looks: Record<string, Look> = {
  Pop: { icon: 'sparkle', tone: 'pink', description: 'Big hooks. Your moment.' },
  Rock: { icon: 'guitar', tone: 'orange', description: 'Turn it up and sing out.' },
  Country: { icon: 'guitar', tone: 'gold', description: 'Stories worth singing.' },
  'R&B/Soul': { icon: 'mic', tone: 'purple', description: 'Find your soul.' },
  'Dance/Electronic': { icon: 'headphones', tone: 'teal', description: 'Bring the dance floor.' },
  'Hip-Hop/Rap': { icon: 'mic', tone: 'blue', description: 'Step up to the mic.' },
  'Jazz/Swing': { icon: 'piano', tone: 'gold', description: 'A little swing tonight.' },
  'Musical Theatre': { icon: 'film', tone: 'purple', description: 'Take centre stage.' },
  'Classical/Opera': { icon: 'piano', tone: 'purple', description: 'Make it a grand occasion.' },
  'Film/TV': { icon: 'film', tone: 'blue', description: 'Sing a screen favourite.' },
  'Folk/Acoustic': { icon: 'leaf', tone: 'green', description: 'Keep it close and acoustic.' },
  'Reggae/Ska': { icon: 'record', tone: 'green', description: 'Settle into the rhythm.' },
  Blues: { icon: 'guitar', tone: 'blue', description: 'Sing it from the heart.' },
  Metal: { icon: 'bolt', tone: 'orange', description: 'Give it everything.' },
  Punk: { icon: 'bolt', tone: 'pink', description: 'A little extra attitude.' },
  Disco: { icon: 'record', tone: 'pink', description: 'Light up the dance floor.' },
  Funk: { icon: 'record', tone: 'orange', description: 'Find your groove.' },
  Latin: { icon: 'party', tone: 'orange', description: 'Let the rhythm lead.' },
  World: { icon: 'globe', tone: 'teal', description: 'A world of songs.' },
  "Children's": { icon: 'sparkle', tone: 'gold', description: 'For the little superstars.' },
  'Easy Listening': { icon: 'headphones', tone: 'teal', description: 'Take it easy.' },
  'Gospel/Christian': { icon: 'mic', tone: 'blue', description: 'Lift your voice.' },
  'Party starters': { icon: 'party', tone: 'orange', description: 'Get the night going.' },
  Ballads: { icon: 'heart', tone: 'pink', description: 'Put your heart into it.' },
  'Family favourites': { icon: 'people', tone: 'teal', description: 'Bring everyone together.' },
  'Wedding favourites': { icon: 'rings', tone: 'purple', description: 'For your favourite people.' },
  Musicals: { icon: 'film', tone: 'purple', description: 'Your show-stopping moment.' },
  Christmas: { icon: 'tree', tone: 'green', description: 'A little festive spirit.' },
  'Irish favourites': { icon: 'leaf', tone: 'green', description: 'A chorus to share.' },
}
function lookFor (key: CategoryKey, value: string): Look {
  if ((key === 'genre' || key === 'collection') && looks[value]) return looks[value]
  return { icon: key === 'decade' ? 'record' : key === 'language' ? 'globe' : key === 'performance' ? value === 'Solo' ? 'mic' : 'people' : 'sparkle', tone: 'blue', description: key === 'decade' ? 'Revisit an era.' : key === 'language' ? 'Find your words.' : key === 'performance' ? 'Choose your way to sing.' : 'Find your next favourite.' }
}
function CategoryIcon ({ name }: { name: IconName }) {
  return <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'><path d={paths[name]} /></svg>
}

export default function CategoryBrowser ({ options, filters, mode, onModeChange, onChange, onResults, onSearch, resultsReady }: Props) {
  const id = useId()
  const [group, setGroup] = useState<CategoryKey>('genre')
  const [expanded, setExpanded] = useState(false)
  const cardsButton = useRef<HTMLButtonElement>(null)
  const selection = useRef<HTMLDivElement>(null)
  const openingCategory = useRef(false)
  const browse = () => { onModeChange('cards'); requestAnimationFrame(() => { cardsButton.current?.focus({ preventScroll: true }); cardsButton.current?.scrollIntoView({ block: 'start' }) }) }
  const available = groups.filter(item => options[item.key].length > 0)
  const current = available.find(item => item.key === group) ?? available[0]
  const key = current?.key ?? 'genre'
  const priority = key === 'genre' ? styleOrder : key === 'collection' ? collectionOrder : []
  const values = [...options[key]].sort((a, b) => {
    const rank = (v: string) => priority.includes(v) ? priority.indexOf(v) : priority.length
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  const selected = groups.filter(item => filters[item.key])
  useLayoutEffect(() => {
    if (mode === 'search' && resultsReady && openingCategory.current && selection.current) {
      selection.current.scrollIntoView({ block: 'start' })
      openingCategory.current = false
    }
  }, [mode, filters.genre, filters.collection, filters.decade, filters.language, filters.performance, resultsReady])
  return <section className={styles.browser} aria-label='Ways to browse'>
    <div className={styles.routes} role='group' aria-label='Browse method'>
      <button type='button' ref={cardsButton} aria-pressed={mode === 'cards'} aria-controls={id} onClick={browse}><Icon icon='NAV_LIBRARY' size={20} />Category cards</button>
      <button type='button' aria-pressed={mode === 'search'} onClick={() => { onModeChange('search'); onSearch() }}><Icon icon='MAGNIFIER' size={20} />Search &amp; filters</button>
    </div>
    {mode === 'cards' && <div id={id} className={styles.panel}>
      <div className={styles.heading}><div><h2>What are you in the mood for?</h2><p>Pick a category. Find your chorus.</p></div></div>
      {available.length > 0 && <div className={styles.groups} role='group' aria-label='Category groups'>{available.map(item => <button type='button' key={item.key} aria-pressed={key === item.key} onClick={() => { setGroup(item.key); setExpanded(false) }}>{item.label}</button>)}</div>}
      <div className={styles.grid} role='group' aria-label={current?.label ?? 'Categories'}>
        {(expanded ? values : values.slice(0, 8)).map(value => {
          const look = lookFor(key, value)
          return <button type='button' key={value} className={`${styles.card} ${styles[look.tone]}`} aria-label={`Browse ${value}`} aria-pressed={filters[key] === value} onClick={() => { openingCategory.current = true; onChange({ ...resetCategories, [key]: value }); onModeChange('search'); onResults() }}>
            <span className={styles.art}><CategoryIcon name={look.icon} /></span><span className={styles.cardIcon}><CategoryIcon name={look.icon} /></span>
            <strong>{value}</strong><small>{look.description}</small>
          </button>
        })}
      </div>
      {values.length > 8 && <button type='button' className={styles.more} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer categories' : `Show all ${values.length} ${current.label.toLocaleLowerCase()}`}</button>}
      {!available.length && <p className={styles.empty}>Categories appear as songs are labelled. You can search all songs at any time.</p>}
    </div>}
    {mode === 'search' && selected.length > 0 && <div ref={selection} className={styles.selection}><div><span>YOU’RE BROWSING</span><strong>{selected.map(item => filters[item.key]).join(' · ')}</strong></div><button type='button' onClick={() => { onChange(resetCategories); browse() }}>All categories</button></div>}
  </section>
}
