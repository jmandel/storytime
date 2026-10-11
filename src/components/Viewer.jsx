// Look at a book without a call: the same page view the reader gets, full screen, with a PDF download.
import {useEffect, useState} from 'react'
import {Page} from './Call.jsx'
import {entriesById, openBook} from '../lib/library.js'
import {downloadPdf} from '../lib/pdf.js'

export function Viewer({entry, books, lk, lib, onClose}) {
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
    <div id="viewer" className="overlay on">
      <div id="book" className="viewer">
        <div id="bookHead">
          <div id="bookTitle">{book ? current.title : `${current.title}…`}</div>
          <button id="downloadBtn" className="ghost" disabled={!book || !!busy} onClick={download}>{busy || 'Download PDF'}</button>
          <button id="viewerClose" className="ghost" onClick={onClose}>Close</button>
        </div>
        {error && <div id="shelfMsg">Couldn't open it ({error}).</div>}
        {book && <Page book={book} pageNo={pageNo} goTo={goTo} nextStory={next} onNextStory={() => setCurrent(next)} />}
      </div>
    </div>
  )
}
