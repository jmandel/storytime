// Look at a book without a call: the same page view the reader gets, full screen, with a PDF download.
import {useEffect, useState} from 'react'
import {Page} from './Call.jsx'
import {entriesById, openBook, useFamilyBooks} from '../lib/library.js'
import {go, goReplace} from '../lib/links.js'
import {downloadPdf} from '../lib/pdf.js'
import {removeLocalBook} from '../lib/localbooks.js'
import {useStored} from '../lib/store.js'
import {FAMILY} from '../lib/family.js'

// A book on its own page (#view=<id>), opened from the home screen; the books are this device's family's.
export function ViewRoute({id}) {
  const family = useStored(FAMILY)
  const {books, error, lk, lib} = useFamilyBooks(family)
  const entry = books && entriesById(books).get(id)
  useEffect(() => { document.title = entry ? `${entry.title} - Storytime` : 'Storytime' }, [entry?.title])
  const close = () => history.state?.storytime ? history.back() : go('')
  if (!books) return <main className="screen center"><p className="hint">Loading…</p></main>
  if (!entry || entry.collection) return (
    <main className="screen center">
      <p>{error ? `The books didn't load (${error}).` : "This book isn't in this family's library."}</p>
      <button className="quiet" onClick={() => go('')}>All books</button>
    </main>
  )
  return <Viewer entry={entry} books={books} lk={lk} lib={lib} page onClose={close} />
}

// A book added in the browser, as a file: its book.json with the pictures inside. tools/unpack-book.mjs turns it into
// a book folder (book.json + page-NN.jpg) to polish and pack like any other.
function exportBook(book) {
  const {f, local, at, by, cover, ...rest} = book
  const blob = new Blob([JSON.stringify({...rest, pages: rest.pages.map(({thumb, ...p}) => p)})], {type: 'application/json'})
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `${book.id}.storytime.json`})
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function Viewer({entry, books, lk, lib, onClose, page: standalone}) {
  const [current, setCurrent] = useState(entry)
  const [book, setBook] = useState(null)
  const [pageNo, setPageNo] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const byId = entriesById(books)
  const next = current.next && byId.get(current.next)

  useEffect(() => {
    let live = true
    setBook(null)
    setError('')
    openBook(current, lk, lib).then(b => { if (live) { setBook(b); setPageNo(0) } }, e => live && setError(e.message))
    return () => { live = false }
  }, [current.id])

  const goTo = i => book && setPageNo(Math.max(0, Math.min(book.pages.length - 1, i)))
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight') goTo(pageNo + 1)
      if (e.key === 'ArrowLeft') goTo(pageNo - 1)
      if (e.key === 'Escape') onClose()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  const download = async () => {
    setBusy('Making PDF…')
    try { await downloadPdf(book) } catch (e) { setError(e.message) }
    setBusy('')
  }

  return (
    <main id="viewer" className={standalone ? 'screen' : 'overlay'}>
      <aside id="book" className="viewer">
        <header id="bookHead">
          <h2 id="bookTitle">{book ? current.title : `${current.title}…`}</h2>
          {current.local && <>
            <button id="changeBtn" className="quiet" onClick={() => go(`add=${encodeURIComponent(current.id)}`)}>Change</button>
            <button id="exportBtn" className="quiet" disabled={!book} onClick={() => exportBook(book)}>Export</button>
            <button id="removeBtn" className="quiet danger" onClick={async () => {
              if (!confirm(`Remove ${current.title} from the family's books? It goes from everyone's devices too.`)) return
              await removeLocalBook(current.f, current.id); goReplace('')
            }}>Remove</button>
          </>}
          <button id="downloadBtn" className="quiet" disabled={!book || !!busy} onClick={download}>{busy || 'Download PDF'}</button>
          <button id="viewerClose" className="quiet" onClick={onClose}>{standalone ? 'All books' : 'Close'}</button>
        </header>
        {error && <p id="shelfMsg" className="hint">It didn't open ({error}).</p>}
        {book && <Page book={book} pageNo={pageNo} goTo={goTo} nextStory={next} onNextStory={() => setCurrent(next)} />}
      </aside>
    </main>
  )
}
