export interface SongCategories {
  genre: string
  language: string
  decade: string
  performance: string
  collections: string[]
  genres?: string[]
  languages?: string[]
  featured?: boolean
}

export const emptyCategories: SongCategories = {
  genre: '', language: '', decade: '', performance: '', collections: [],
}

// Keep the wire format bounded and deterministic. Missing fields clear a tag;
// unknown fields never reach storage or the clients.
export function validateCategories (input: unknown): SongCategories {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Categories must be an object')
  const source = input as Record<string, unknown>
  const text = (key: string, max = 40) => {
    const value = source[key] ?? ''
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${key}`)
    return value.trim()
  }
  const decade = text('decade')
  if (decade && !/^(18|19|20)\d0s$/.test(decade)) throw new Error('Use a decade such as 1980s')
  const performance = text('performance')
  if (performance && !['Solo', 'Duet', 'Group'].includes(performance)) throw new Error('Invalid performance type')
  const collections = source.collections ?? []
  if (!Array.isArray(collections) || collections.length > 12 || collections.some(v => typeof v !== 'string' || !v.trim() || v.length > 40 || /[\u0000-\u001f]/.test(v))) throw new Error('Use up to 12 collection names, each at most 40 characters')
  const result: SongCategories = { genre: text('genre'), language: text('language'), decade, performance, collections: [...new Set(collections.map(v => v.trim()))] }
  if (source.featured !== undefined) {
    if (typeof source.featured !== 'boolean') throw new Error('Invalid featured flag')
    result.featured = source.featured
  }
  for (const [key, primary] of [['genres', 'genre'], ['languages', 'language']] as const) {
    if (source[key] === undefined) continue
    const values = source[key]
    if (!Array.isArray(values) || values.length > 16 || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 40 || /[\u0000-\u001f]/.test(v))) throw new Error(`Invalid ${key}`)
    result[key] = [...new Set([result[primary], ...values.map(v => v.trim())].filter(Boolean))]
    if (!result[primary] && result[key].length) result[primary] = result[key][0]
  }
  return result
}
