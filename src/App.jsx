import {CallRoute} from './components/Call.jsx'
import {Home} from './components/Home.jsx'
import {useHash} from './lib/links.js'

// A call link (r= and k=) shows the call; anything else is the parent's home screen.
export function App() {
  const params = useHash()
  if (params.get('r') && params.get('k')) return <CallRoute key={params.toString()} params={params} />
  return <Home />
}
