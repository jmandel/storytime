import {createRoot} from 'react-dom/client'
import {App} from './App.jsx'
import {ingestHomeLink} from './lib/store.js'
import './styles.css'

ingestHomeLink()
createRoot(document.getElementById('root')).render(<App />)
