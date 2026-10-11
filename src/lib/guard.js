// Confirm before Back leaves Storytime or drops a call.
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

export function installBackGuards() {
  addEventListener('hashchange', e => {
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
