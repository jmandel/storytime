// The family call: everyone in the family room, in a grid, and the book they're reading together. The open book and
// page are shared (anyone can change them, every screen follows, the latest change wins); each screen chooses how much
// of it to show: the page panel (picture and words; the default on a tablet or laptop) or a slim bar (title, page and
// arrows; the default on a phone, e.g. on the stand filming the child).
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Library} from './Library.jsx'
import {SpeakerText} from './SpeakerText.jsx'
import {WhoForm} from './Home.jsx'
import {markRestart, restartPending, useCall, useWakeLock} from '../lib/call.js'
import {entriesById, openBook as fetchBook, pageLabel, useFamilyBooks} from '../lib/library.js'
import {goReplace, shareLink} from '../lib/links.js'
import {leaveCallOnPurpose, useBackLayer} from '../lib/guard.js'
import {FAMILY, ME, familyLink, rememberPerson} from '../lib/family.js'
import {rememberBook, useStored} from '../lib/store.js'
import {shareBooks} from '../lib/share.js'
import {onLocalChange} from '../lib/localbooks.js'

// preview: preview.html's frames share one browser's storage, so each takes its family and name from its address
// (#call&preview=1&f=<key>&name=<name>) and joins straight away.
export function CallRoute({preview}) {
  const [previewAs] = useState(() => preview && {family: {f: preview.get('f'), name: preview.get('n') || ''},
    self: {name: preview.get('name') || 'Preview', device: Math.random().toString(36).slice(2)}})
  const savedFamily = useStored(FAMILY), savedSelf = useStored(ME)
  const family = previewAs?.family || savedFamily
  const self = previewAs?.self || savedSelf
  const [stream, setStream] = useState(null)
  const [error, setError] = useState('')
  const join = async () => {
    setError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}},
        audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
      }))
    } catch (e) {
      setError(`The camera or microphone isn't available (${e.message}).`)
    }
  }
  // Straight in when this page has already been tapped ("Join the call" on the home screen) or is reconnecting;
  // a freshly opened page asks first, so a reload never turns a camera on by itself.
  const auto = useRef(!!preview || restartPending() || navigator.userActivation?.isActive)
  useEffect(() => { if (auto.current && family?.f && self?.name) join() }, [!!self?.name])
  useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [stream])
  useEffect(() => { document.title = family?.name ? `${family.name} · Storytime` : 'Storytime' }, [family?.name])

  if (!family?.f) return (
    <main className="screen center">
      <p>This device isn't in a family yet. Open your family link on it first.</p>
      <button className="quiet" onClick={() => goReplace('')}>Storytime home</button>
    </main>
  )
  if (!self?.name) return <main className="screen center"><WhoForm family={family} /></main>
  if (stream) return <Call family={family} self={self} stream={stream} preview={!!preview} onLeave={() => setStream(null)} />
  return (
    <main id="join" className="screen center">
      <h1 id="joinTitle">{family.name || 'Storytime'}</h1>
      <p className="lede">Joining as {self.name}</p>
      <button id="joinBtn" className="lamp big" onClick={join}>Join the call</button>
      <p className="hint">This turns on the camera and microphone.</p>
      {inAppBrowser && <p id="inAppHint" className="warn">If the call doesn't work here, open this link in {/iPhone|iPad/.test(navigator.userAgent) ? 'Safari' : 'Chrome'} instead.</p>}
      {error && <p id="joinErr" className="warn">{error}</p>}
      <button className="quiet" onClick={() => goReplace('')}>Storytime home</button>
    </main>
  )
}

// A browser built into another app (Facebook, Instagram, Gmail's or Messenger's viewer, an Android WebView), where
// cameras and calls often don't work.
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|GSA\/|; wv\)/.test(navigator.userAgent)

// onBlocked: the browser refused to start playback (sound needs a tap first).
function Video({stream, onBlocked, ...props}) {
  const ref = useRef()
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play?.()?.catch(e => e.name === 'NotAllowedError' && onBlocked?.())
  }, [stream])
  return <video ref={ref} autoPlay playsInline {...props} />
}

// The shared book: {id, page, at, by}. A change here is sent to everyone; a change from anyone else is taken if it is
// newer. Someone joining is sent what is open.
function useSharedBook(handlers, call, self) {
  const [book, setBook] = useState(null)
  const ref = useRef(null)
  ref.current = book
  const take = b => { if (b?.id) rememberBook(b.id); setBook(b) }
  const newer = (a, b) => !b || a.at > b.at || (a.at === b.at && a.by > b.by)
  handlers.current.onMessage = msg => { if (msg?.book && newer(msg.book, ref.current)) take(msg.book) }
  handlers.current.onPeerJoin = id => ref.current && call.send({book: ref.current}, id)
  const set = (id, page) => {
    const b = {id, page, at: Math.max(Date.now(), (ref.current?.at || 0) + 1), by: self.device}
    take(b)
    call.send({book: b})
  }
  return [book, set]
}

function Call({family, self, stream, preview, onLeave}) {
  const handlers = useRef({onPerson: rememberPerson})
  const sharing = useRef(null)  // passes books added in the browser to the others (src/lib/share.js)
  const call = useCall(family, self, stream, {
    onPeerJoin: id => { handlers.current.onPeerJoin?.(id); sharing.current?.offer(id) },
    onMessage: (msg, id) => handlers.current.onMessage?.(msg, id),
    onPerson: name => handlers.current.onPerson?.(name),
    onRoom: room => { sharing.current = shareBooks(family.f, room) },
  })
  useEffect(() => onLocalChange(() => sharing.current?.offer()), [])
  const [shared, setShared] = useSharedBook(handlers, call, self)
  const {books, error: booksError, lk, lib} = useFamilyBooks(family)
  const [panel, setPanel] = useState(() => innerWidth >= 820)
  const [picking, setPicking] = useState(false)
  useBackLayer(picking, () => setPicking(false))
  const [muted, setMuted] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useWakeLock()

  const toggleMute = () => {
    const track = stream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }
  const leave = () => { leaveCallOnPurpose(); goReplace(''); onLeave() }
  const open = entry => { setPicking(false); setShared(entry.id, 0) }

  if (call.replaced) return (
    <main id="moved" className="screen center">
      <h1>The call moved to another window</h1>
      <p className="lede">This device opened the call somewhere else, so this window stepped aside.</p>
      <button id="useHereBtn" className="lamp big" onClick={() => { markRestart(); location.reload() }}>Use this window</button>
      <button className="quiet" onClick={leave}>Leave</button>
    </main>
  )
  const people = call.people
  return (
    <main id="call" className={`screen${panel ? ' withBook' : ''}`}>
      <div id="stage">
        <div id="grid" data-count={people.length || 1}>
          {people.map(p => (
            <figure key={p.id} className={`tile${p.live ? ' live' : ''}`}>
              <Video className="remote" stream={p.stream} muted={preview} onBlocked={() => setBlocked(true)} />
              <figcaption>{p.name || 'Joining…'}{!p.live && <span className="state"> · connecting</span>}</figcaption>
            </figure>
          ))}
          {!people.length && <Waiting family={family} status={call.status} onRetry={call.retry} />}
        </div>
        {blocked && <button id="tapToPlay" className="lamp big" onClick={() => { document.querySelectorAll('video.remote').forEach(v => v.play().catch(() => {})); setBlocked(false) }}>
          Tap to hear everyone</button>}
        <figure id="selfTile" className="tile self">
          <Video id="self" stream={stream} muted />
          <figcaption>{self.name}{muted ? ' · muted' : ''}</figcaption>
        </figure>
        {call.status.cls === 'warn' && <div id="status" className="warn">{call.status.text}</div>}
        {!panel && shared && <BookBar shared={shared} books={books} onTurn={p => setShared(shared.id, p)} onPick={() => setPicking(true)} />}
        <nav id="bar">
          <button id="muteBtn" className={`quiet${muted ? ' on' : ''}`} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button id="bookToggle" className="quiet" onClick={() => setPanel(v => !v)}>{panel ? 'Hide the book' : shared ? 'Show the words' : 'Books'}</button>
          <button id="leaveBtn" className="quiet" onClick={leave}>Leave</button>
        </nav>
      </div>
      {panel && <BookPanel shared={shared} books={books} booksError={booksError} lk={lk} lib={lib}
        onOpen={open} onTurn={p => setShared(shared.id, p)} />}
      {picking && books && (
        <div id="picker" className="overlay" onClick={e => e.target === e.currentTarget && setPicking(false)}>
          <div className="sheet wide">
            <h2>Pick a book</h2>
            <Library id="pickerShelf" books={books} current={shared?.id} onPick={open} />
            <button id="pickerClose" className="quiet" onClick={() => setPicking(false)}>Close</button>
          </div>
        </div>
      )}
    </main>
  )
}

// Nobody else here yet: say so, offer the family link, and after a while "Try again".
function Waiting({family, status, onRetry}) {
  const [long, setLong] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLong(true), 30000); return () => clearTimeout(t) }, [])
  return (
    <div id="waiting">
      <h2>{status.cls === 'warn' ? status.text : status.text || 'Waiting for the family'}</h2>
      <p>Anyone who opens the family link joins this call.</p>
      <div className="row">
        <button id="shareBtn" className="quiet" onClick={() => shareLink(familyLink(family), family.name || 'Storytime')}>Send the family link</button>
        {long && <button id="retryBtn" className="quiet" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}

// The slim book bar over the video: what's open, which page, arrows, and a way to pick another book.
function BookBar({shared, books, onTurn, onPick}) {
  const entry = books && entriesById(books).get(shared.id)
  const count = entry?.pages
  return (
    <div id="bookBar">
      {entry?.cover && <img src={entry.cover} alt="" />}
      <button id="pageBadge" className="label" onClick={onPick}>
        <span className="t">{entry?.title || 'A book'}</span>
        <span className="p">{shared.page === 0 ? 'Cover' : `Page ${shared.page}`}{count ? ` of ${count - 1}` : ''}</span>
      </button>
      <button id="barPrev" className="quiet arrow" aria-label="Previous page" disabled={shared.page <= 0} onClick={() => onTurn(shared.page - 1)}>‹</button>
      <button id="barNext" className="quiet arrow" aria-label="Next page" disabled={count != null && shared.page >= count - 1} onClick={() => onTurn(shared.page + 1)}>›</button>
    </div>
  )
}

// The page panel: the shared book's page (picture and words), or the shelf when nothing is open.
function BookPanel({shared, books, booksError, lk, lib, onOpen, onTurn}) {
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [shelf, setShelf] = useState(false)
  useBackLayer(shelf && !!shared, () => setShelf(false))
  const byId = entriesById(books)
  const entry = shared && byId.get(shared.id)
  useEffect(() => {
    if (!entry) return
    let live = true
    setError('')
    if (book?.id !== entry.id) setBook(null)
    fetchBook(entry, lk, lib).then(b => live && setBook(b), e => live && setError(`${entry.title} didn't open (${e.message}).`))
    return () => { live = false }
  }, [entry?.id, entry?.at, lk])  // at: a book added in the browser was changed
  useEffect(() => setShelf(false), [shared?.id])
  const pageNo = book ? Math.max(0, Math.min(book.pages.length - 1, shared.page)) : 0
  const goTo = i => book && onTurn(Math.max(0, Math.min(book.pages.length - 1, i)))
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') goTo(pageNo + 1)
      if (e.key === 'ArrowLeft') goTo(pageNo - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  const nextStory = entry?.next && byId.get(entry.next)
  const showShelf = !shared || shelf || !entry
  const title = showShelf ? 'Pick a book' : book ? (book.collection ? `${book.collection.title}: ${book.title}` : book.title) : `${entry.title}…`
  return (
    <aside id="book">
      <header id="bookHead">
        <h2 id="bookTitle">{title}</h2>
        {!showShelf && <button id="shelfBtn" className="quiet" onClick={() => setShelf(true)}>{book?.collection ? 'Contents' : 'All books'}</button>}
        {showShelf && shared && entry && <button id="shelfClose" className="quiet" onClick={() => setShelf(false)}>Back to the book</button>}
      </header>
      {(error || booksError || !books) && <p id="shelfMsg" className="hint">{error || (booksError ? `The books didn't load (${booksError}).` : 'Loading books…')}</p>}
      {showShelf && books && <Library id="shelf" books={books} current={shared?.id} openCollection={entry?.parent?.id}
        onPick={onOpen} />}
      {!showShelf && book && <Page book={book} pageNo={pageNo} goTo={goTo}
        nextStory={nextStory} onNextStory={() => onOpen(nextStory)} />}
    </aside>
  )
}

const MIN_TEXT = 22
export function Page({book, pageNo, goTo, nextStory, onNextStory}) {
  const page = book.pages[pageNo]
  const readerRef = useRef(), textRef = useRef(), wrapRef = useRef(), stripRef = useRef()

  // Largest type at which the whole page's words fit their box: up to about a twelfth of the box's width (so ~30px
  // on a phone, up to 64px on a tablet), never below MIN_TEXT. The picture always shows, at the same height on
  // every page; words that don't fit at MIN_TEXT scroll, with a "more" cue.
  const fit = () => {
    const el = textRef.current, box = readerRef.current
    if (!el || !box) return
    const fits = () => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth
    const size = () => {
      let lo = MIN_TEXT, hi = Math.max(MIN_TEXT + 1, Math.min(64, Math.round(el.clientWidth / 12)))
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        el.style.fontSize = `${mid}px`
        if (fits()) lo = mid
        else hi = mid
      }
      el.style.fontSize = `${lo}px`
    }
    size()
    moreCue()
  }
  const moreCue = () => {
    const el = textRef.current
    wrapRef.current?.classList.toggle('more', el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }
  useLayoutEffect(() => { textRef.current.scrollTop = 0; fit() }, [book, pageNo])
  useEffect(() => {
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])
  useEffect(() => {
    stripRef.current?.children[pageNo]?.scrollIntoView({inline: 'center', block: 'nearest', behavior: 'smooth'})
  }, [book, pageNo])

  return (
    <div id="reader" ref={readerRef}>
      <img id="pageImg" src={page.img} alt="" onLoad={fit} />
      {page.note && <div id="pageNote">{page.note}</div>}
      <div id="textWrap" ref={wrapRef}>
        <div id="pageText" ref={textRef} onScroll={moreCue}><SpeakerText text={page.text} voices={book.voices} /></div>
        <div id="moreCue">more ↓</div>
      </div>
      {nextStory && pageNo === book.pages.length - 1 &&
        <button id="nextStory" className="lamp" onClick={onNextStory}>Next story: {nextStory.storyTitle}</button>}
      <div id="nav">
        <button id="prevBtn" className="quiet arrow" aria-label="Previous page" disabled={pageNo === 0} onClick={() => goTo(pageNo - 1)}>‹</button>
        <div id="pageNum">{pageLabel(book, pageNo)}</div>
        <button id="nextBtn" className="lamp arrow" aria-label="Next page" disabled={pageNo === book.pages.length - 1} onClick={() => goTo(pageNo + 1)}>›</button>
      </div>
      <div id="strip" ref={stripRef}>
        {book.pages.map((p, i) => (
          <img key={i} src={p.thumb} alt={pageLabel(book, i)} className={i === pageNo ? 'cur' : ''} onClick={() => goTo(i)} />
        ))}
      </div>
    </div>
  )
}
