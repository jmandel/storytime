import {createRoot} from 'react-dom/client'
import {App} from './App.jsx'
import {MY_CALL, SETUP, ingestHomeLink, read} from './lib/store.js'
import {installBackGuards} from './lib/guard.js'
import './styles.css'

ingestHomeLink()
// Also when a home link is opened in a tab that already shows the app (only the hash changes, no reload). This
// listener is added before React's, so the setup is saved before the screen re-renders.
addEventListener('hashchange', ingestHomeLink)
// The reader's tablet opened at the bare address (a home-screen icon or bookmark without the link): its call.
if (!location.hash && !read(SETUP) && read(MY_CALL)) history.replaceState(null, '', `#${read(MY_CALL)}`)
installBackGuards()
watchForUpdates()
// A home-screen app can stay open for days without reloading. When it comes back to the front (and every half hour),
// outside a call, reload if a new version has been published.
function watchForUpdates() {
  const url = new URL('app.js', document.baseURI).href
  const version = () => fetch(url, {method: 'HEAD', cache: 'no-cache'})
    .then(r => r.ok ? r.headers.get('etag') || r.headers.get('last-modified') : null, () => null)
  let running = null
  version().then(v => { running = v })
  const check = async () => {
    if (document.hidden || !running) return
    const v = await version()
    if (v && v !== running && !document.getElementById('call') && !document.getElementById('moved')) location.reload()
  }
  document.addEventListener('visibilitychange', check)
  setInterval(check, 30 * 60000)
}

createRoot(document.getElementById('root')).render(<App />)
