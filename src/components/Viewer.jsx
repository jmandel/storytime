// Look at a book without a call: the same page view the reader gets, full screen, with a PDF download.
import {useEffect, useState} from 'react'
import {Page} from './Call.jsx'
import {entriesById, openBook, useLibrary} from '../lib/library.js'
import {go} from '../lib/links.js'
import {downloadPdf} from '../lib/pdf.js'
import {SETUP, useStored} from '../lib/store.js'

// A book on its own page (#view=<id>), opened in a new tab from the start screen; the library key comes from this
// device's saved setup.
export function ViewRoute({id}) {
  const setup = useStored(SETUP)
  const {books, error} = useLibrary(setup?.lk, setup?.lib)
  const entry = books && entriesById(books).get(id)
  useEffect(() => { document.title = entry ? `${entry.title} - Storytime` : 'Storytime' }, [entry?.title])
  if (!books) return <section className="screen on center"><p>Loading…</p></section>
  if (!entry || entry.collection) return (
    <section className="screen on center">
      <p>{error ? `Couldn't open the books (${error}).` : "This book isn't in the library on this device."}</p>
      <button className="ghost" onClick={() => go('')}>All books</button>
    </section>
  )
  return <Viewer entry={entry} books={books} lk={setup?.lk} lib={setup?.lib} page onClose={() => go('')} />
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
    <div id="viewer" className={standalone ? 'screen on' : 'overlay on'}>
      <div id="book" className="viewer">
        <div id="bookHead">
          <div id="bookTitle">{book ? current.title : `${current.title}…`}</div>
          <button id="downloadBtn" className="ghost" disabled={!book || !!busy} onClick={download}>{busy || 'Download PDF'}</button>
          <button id="viewerClose" className="ghost" onClick={onClose}>{standalone ? 'All books' : 'Close'}</button>
        </div>
        {error && <div id="shelfMsg">Couldn't open it ({error}).</div>}
        {book && <Page book={book} pageNo={pageNo} goTo={goTo} nextStory={next} onNextStory={() => setCurrent(next)} />}
      </div>
    </div>
  )
}
