import playful1 from '../artwork/playful-1.webp'
import playful2 from '../artwork/playful-2.webp'
import playful3 from '../artwork/playful-3.webp'
import playful4 from '../artwork/playful-4.webp'
import playful5 from '../artwork/playful-5.webp'
import serious1 from '../artwork/serious-1.webp'
import serious2 from '../artwork/serious-2.webp'
import serious3 from '../artwork/serious-3.webp'
import serious4 from '../artwork/serious-4.webp'
import serious5 from '../artwork/serious-5.webp'

export type ArtworkTheme = 'playful' | 'serious'
const sheets = { playful: [playful1, playful2, playful3, playful4, playful5], serious: [serious1, serious2, serious3, serious4, serious5] }
const cells: Record<string, [number, number]> = {
  "Pop": [0, 0],
  "Rock": [0, 1],
  "Country": [0, 2],
  "R&B/Soul": [0, 3],
  "Dance/Electronic": [0, 4],
  "Hip-Hop/Rap": [0, 5],
  "Jazz/Swing": [1, 0],
  "Musical Theatre": [1, 1],
  "Blues": [1, 2],
  "Classical/Opera": [1, 3],
  "Folk/Acoustic": [1, 4],
  "Reggae/Ska": [1, 5],
  "Metal": [2, 0],
  "Punk": [2, 1],
  "Disco": [2, 2],
  "Funk": [2, 3],
  "Latin": [2, 4],
  "World": [2, 5],
  "Children's": [3, 0],
  "Easy Listening": [3, 1],
  "Gospel/Christian": [3, 2],
  "Film/TV": [3, 3],
  "Party starters": [3, 4],
  "Ballads": [3, 5],
  "Family favourites": [4, 0],
  "Wedding favourites": [4, 1],
  "Musicals": [4, 2],
  "Christmas": [4, 3],
  "Irish favourites": [4, 4],
  "Custom": [4, 5]
}

export function categoryArtwork (theme: ArtworkTheme, kind: string, value: string) {
  if (kind !== 'genre' && kind !== 'collection') return null
  const [sheet, cell] = cells[value] ?? cells.Custom
  return { src: sheets[theme][sheet], column: cell % 3, row: Math.floor(cell / 3) }
}

export function readArtworkTheme (key: string): ArtworkTheme {
  try { return localStorage.getItem(key) === 'serious' ? 'serious' : 'playful' } catch { return 'playful' }
}

