import {useEffect} from 'react'

// Back inside Storytime, and confirming before Back leaves it or drops a call.
// - Layers (the invite screen, settings, book lists, a collection's contents, the in-call picker) are drawn over a
//   screen without changing the address. Each open layer has its own history entry (useBackLayer), so Back closes
//   the top layer and nothing else.
// - Start screen: an extra history entry sits on top, so Back lands on it and asks "Leave Storytime?" before going
//   further back (out of the app).
// - Call: Back changes the hash away from the call link; ask "Leave the call?" and, if not, go forward again. This
//   listener is installed before React's, so a cancelled Back never re-renders. The Leave button sets `leaving`.
const isCall = url => {
  const p = new URLSearchParams(new URL(url).hash.slice(1))
  return !!(p.get('r') && p.get('k'))
}
const isHome = () => {
  const p = new URLSearchParams(location.hash.slice(1))
  return !(p.get('r') && p.get('k')) && !p.get('view')
}

let leaving = false, restoring = false, exiting = false, own = false
// Changing the hash from code also fires popstate; the app marks its own navigations so they aren't taken for Back.
export const markOwnNavigation = () => { own = true }
export const leaveCallOnPurpose = () => { leaving = true }

// Every history entry the app has been on gets a stamp in history.state. A popstate to an unstamped entry is a new
// navigation (a link or address opened in this tab, or the app's own hash change), not Back.
const stamp = () => { if (!history.state) history.replaceState({storytime: true}, '', location.href) }

export function installBackGuards() {
  stamp()
  addEventListener('hashchange', e => {
    stamp()
    if (restoring) { restoring = false; return }
    if (exiting) return
    if (isCall(e.oldURL) && !isCall(e.newURL)) {
      if (leaving) { leaving = false; return }
      if (!confirm('Leave the call?')) {
        e.stopImmediatePropagation()
        restoring = true
        history.go(1)
      }
    }
  })
  addEventListener('popstate', e => {
    if (own) { own = false; return }
    if (layers.length) { const top = layers.pop(); top.popped = true; top.close(); return }
    if (e.state?.layer) return  // a stale layer entry (its layer is gone); stay put
    if (!e.state) return  // a new entry, not Back
    // Leaving: keep stepping back past Storytime's own entries until the browser leaves the page.
    if (exiting) return history.back()
    if (!isHome() || e.state?.storytimeGuard) return
    if (confirm('Leave Storytime?')) { exiting = true; history.back() }
    else history.pushState({storytimeGuard: true}, '', location.href)
  })
}

// Called when the start screen shows: make sure the guard entry is on top.
export function guardHome() {
  if (!history.state?.storytimeGuard) history.pushState({storytimeGuard: true}, '', location.href)
}

// While `open`, a layer owns a history entry: Back calls `close`. Closing it another way (a button, picking
// something) removes the entry again, unless the app has already navigated elsewhere (then the entry is left
// behind and skipped on Back).
const layers = []
let layerIds = 0
export function useBackLayer(open, close) {
  useEffect(() => {
    if (!open) return
    const entry = {id: ++layerIds, close, popped: false}
    history.pushState({storytime: true, layer: entry.id}, '', location.href)
    layers.push(entry)
    return () => {
      const i = layers.indexOf(entry)
      if (i >= 0) layers.splice(i, 1)
      if (!entry.popped && history.state?.layer === entry.id) { own = true; history.back() }
    }
  }, [open])
}
