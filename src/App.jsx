import {CallRoute} from './components/Call.jsx'
import {Home} from './components/Home.jsx'
import {ViewRoute} from './components/Viewer.jsx'
import {useHash} from './lib/links.js'

// A call link (r= and k=) shows the call; view=<book id> shows one book in the reader's page view (no call);
// anything else is the parent's home screen.
export function App() {
  const params = useHash()
  if (params.get('r') && params.get('k')) return <CallRoute key={params.toString()} params={params} />
  if (params.get('view')) return <ViewRoute key={params.get('view')} id={params.get('view')} />
  return <Home />
}
