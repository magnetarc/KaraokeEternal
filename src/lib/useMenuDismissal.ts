import { useEffect } from 'react'

const selector = 'details[data-menu-popup]'

// One delegated listener set for all popup menus. Ordinary details panels,
// including queue history, keep their normal open/close behaviour.
export default function useMenuDismissal () {
  useEffect(() => {
    const openMenus = () => [...document.querySelectorAll<HTMLDetailsElement>(selector + '[open]')]
    const closeOutside = (target: Node | null) => {
      for (const menu of openMenus()) if (!target || !menu.contains(target)) menu.open = false
    }
    const onOutside = (event: Event) => closeOutside(event.target instanceof Node ? event.target : null)
    const onToggle = (event: Event) => {
      const menu = event.target
      if (menu instanceof HTMLDetailsElement && menu.matches(selector) && menu.open) closeOutside(menu)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const menus = openMenus()
      if (!menus.length) return
      closeOutside(null)
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      event.stopPropagation()
      menus.at(-1)?.querySelector('summary')?.focus({ preventScroll: true })
    }
    const onAction = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const action = event.target.closest('button,a')
      const menu = action?.closest<HTMLDetailsElement>(selector)
      if (!menu?.open || action.matches(':disabled,[aria-disabled="true"]')) return
      menu.open = false
      // Focus the trigger before an action opens a dialog, so its own focus
      // restoration returns here instead of to a now-hidden menu button.
      menu.querySelector('summary')?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('focusin', onOutside, true)
    document.addEventListener('toggle', onToggle, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onAction, true)
    return () => {
      closeOutside(null)
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('focusin', onOutside, true)
      document.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onAction, true)
    }
  }, [])
}
