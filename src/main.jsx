import {createRoot} from 'react-dom/client'
import {App} from './App.jsx'
import {ingestHomeLink} from './lib/store.js'
import {installBackGuards} from './lib/guard.js'
import './styles.css'

ingestHomeLink()
// Also when a home link is opened in a tab that already shows the app (only the hash changes, no reload). This
// listener is added before React's, so the setup is saved before the screen re-renders.
addEventListener('hashchange', ingestHomeLink)
installBackGuards()
createRoot(document.getElementById('root')).render(<App />)
