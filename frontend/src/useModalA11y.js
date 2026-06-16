import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Dialog accessibility for modals: Escape-to-close, focus trap (Tab cycles
// within the dialog), and focus restore to the previously-focused element on
// close. Pass a ref to the dialog container (which should have tabIndex={-1}).
export function useModalA11y(ref, onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    const prevFocus = document.activeElement

    // Move focus into the dialog (the container itself, so we never auto-focus
    // a destructive action like a Delete button).
    if (node) node.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = node.querySelectorAll(FOCUSABLE)
      if (!items.length) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [ref])
}
