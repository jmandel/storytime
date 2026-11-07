import {CallRoute} from './components/Call.jsx'
import {Home} from './components/Home.jsx'
import {ViewRoute} from './components/Viewer.jsx'
import {AddBook} from './components/AddBook.jsx'
import {useHash} from './lib/links.js'

// #call: the family call; #view=<book id>: one book in the page view (no call); #add (=<id>): add (or change) a book
// in the browser; anything else: home (or welcome).
export function App() {
  const params = useHash()
  if (params.has('call')) return <CallRoute preview={params.get('preview') === '1' ? params : null} />
  if (params.has('add')) return <AddBook key={params.get('add')} id={params.get('add')} />
  if (params.get('view')) return <ViewRoute key={params.get('view')} id={params.get('view')} />
  return <Home />
}
