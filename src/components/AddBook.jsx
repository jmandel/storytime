// Adding a book in the browser (#add), or changing one added here (#add=<id>): photos of the cover and each spread,
// put in order and turned upright, a title, and the words if someone wants to type them (optional: the reader can
// read them off the picture). Saved on this device and passed to the family's other devices during calls.
import {useEffect, useState} from 'react'
import {FAMILY, me} from '../lib/family.js'
import {getLocalBook, newBookId, photoToJpeg, putLocalBook, reshape} from '../lib/localbooks.js'
import {go, goReplace} from '../lib/links.js'
import {useStored} from '../lib/store.js'

const label = i => i === 0 ? 'Cover' : `Page ${i}`

export function AddBook({id}) {
  const family = useStored(FAMILY)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState([])  // [{img, text}]
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id || !family?.f) return
    getLocalBook(family.f, id).then(b => {
      if (!b) return setError("That book isn't on this device.")
      setTitle(b.title); setAuthor(b.author || ''); setPages(b.pages.map(p => ({img: p.img, text: p.text || ''})))
    })
  }, [id, family?.f])
  if (!family?.f) return <main className="screen center"><p>Open your family link on this device first.</p></main>

  const addPhotos = async files => {
    setError('')
    const list = [...files]
    for (const [i, file] of list.entries()) {
      setBusy(`Adding photo ${i + 1} of ${list.length}…`)
      try { const img = await photoToJpeg(file); setPages(p => [...p, {img, text: ''}]) }
      catch { setError(`${file.name} isn't a photo this browser can read.`) }
    }
    setBusy('')
  }
  const change = (i, f) => setPages(p => p.map((x, j) => j === i ? f(x) : x))
  const move = (i, d) => setPages(p => {
    const j = i + d
    if (j < 0 || j >= p.length) return p
    const next = [...p];[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const turn = async i => { setBusy('Turning…'); const img = await reshape(pages[i].img, {turns: 1}); change(i, x => ({...x, img})); setBusy('') }
  const save = async () => {
    setBusy('Saving…')
    const bookId = id || newBookId()
    const withThumbs = []
    for (const p of pages) withThumbs.push({img: p.img, thumb: await reshape(p.img, {max: 320, quality: 0.7}), text: p.text.trim(), ...(p.label ? {label: p.label} : {})})
    await putLocalBook(family.f, {id: bookId, title: title.trim(), author: author.trim(), cover: await reshape(pages[0].img, {max: 240, quality: 0.7}),
      pages: withThumbs, at: Date.now(), by: me().name})
    setBusy('')
    goReplace(`view=${encodeURIComponent(bookId)}`)
  }
  const ready = title.trim() && pages.length > 0 && !busy

  return (
    <main id="addBook" className="screen home">
      <header className="masthead">
        <h1>{id ? 'Change this book' : 'Add a book'}</h1>
        <p className="lede">Photograph the cover, then each spread with the book open flat, in order. Everyone in {family.name || 'the family'} gets
          it the next time you're in a call together.</p>
      </header>
      <div className="card">
        <label>Title <input id="bookTitleInput" value={title} onChange={e => setTitle(e.target.value)} placeholder="Goodnight Moon" /></label>
        <label>Author <input id="bookAuthorInput" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Margaret Wise Brown" /></label>
      </div>
      <div className="row">
        <label className="lamp filePick">Take or choose photos
          <input id="photos" type="file" accept="image/*" multiple onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
        </label>
        {busy && <span className="hint">{busy}</span>}
      </div>
      {error && <p className="warn">{error}</p>}
      {pages.length > 0 && (
        <ol id="pages" className="pageEdit">
          {pages.map((p, i) => (
            <li key={i}>
              <img src={p.img} alt={label(i)} />
              <div className="pageTools">
                <strong>{label(i)}</strong>
                <button className="quiet" aria-label={`Move ${label(i)} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>Earlier</button>
                <button className="quiet" aria-label={`Move ${label(i)} later`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}>Later</button>
                <button className="quiet" onClick={() => turn(i)}>Turn</button>
                <button className="quiet danger" onClick={() => setPages(ps => ps.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <textarea rows="2" placeholder="The words on this page (optional)" value={p.text} onChange={e => change(i, x => ({...x, text: e.target.value}))} />
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        <button id="saveBookBtn" className="lamp" disabled={!ready} onClick={save}>{id ? 'Save changes' : 'Save the book'}</button>
        <button className="quiet" onClick={() => history.state?.storytime ? history.back() : go('')}>Cancel</button>
        {!ready && !busy && <span className="hint">{pages.length ? 'Give it a title to save it.' : 'Add the photos first.'}</span>}
      </div>
    </main>
  )
}
