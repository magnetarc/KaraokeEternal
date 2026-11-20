import React, { useState } from 'react'
import Panel from 'components/Panel/Panel'
import { useAppSelector } from 'store/hooks'
import { readArtworkTheme, type ArtworkTheme } from 'routes/Library/views/categoryArtwork'
export default function Appearance () {
  const userId = useAppSelector(state => state.user.userId)
  const key = `karaoke.categoryArtwork.v1.${userId}`
  const [theme, setTheme] = useState<ArtworkTheme>(() => readArtworkTheme(key))
  const change = (value: ArtworkTheme) => {
    setTheme(value)
    try {
      localStorage.setItem(key, value)
    } catch { /* usable without storage */ }
    window.dispatchEvent(new Event('karaoke-artwork'))
  }
  return (
    <section id='appearance' style={{ scrollMarginTop: 100 }}>
      <Panel title='Appearance'>
        <fieldset>
          <legend>Category artwork</legend>
          <p>Remembered for your account on this browser.</p>
          {(['playful', 'serious'] as const).map(value => (
            <label key={value} style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: 12 }}>
              <input type='radio' name='artwork' checked={theme === value} onChange={() => change(value)} />
              {value === 'playful' ? 'Playful' : 'Serious'}
            </label>
          ))}
        </fieldset>
      </Panel>
    </section>
  )
}
