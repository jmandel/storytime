// A call: join screen, then the video stage. The reader's side adds the book panel; the child's side (the phone on
// the stand) gets small book controls. The reader's tablet is the authority on the open book and page; the phone
// asks for changes ({want}) and shows what the tablet reports.
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Library} from './Library.jsx'
import {SpeakerText} from './SpeakerText.jsx'
import {claimCall, restartPending, useCall, useWakeLock} from '../lib/call.js'
import {entriesById, openBook as fetchBook, pageLabel, useLibrary} from '../lib/library.js'
import {goReplace, linkWith, shareLink} from '../lib/links.js'
import {leaveCallOnPurpose, useBackLayer} from '../lib/guard.js'
import {LAST_CALLS, SETUP, read, rememberBook} from '../lib/store.js'

// The same call's link for the other side.
const otherSide = params => {
  const p = new URLSearchParams(params)
  p.set('as', params.get('as') === 'reader' ? 'child' : 'reader')
  p.delete('preview')
  return p
}

export function CallRoute({params}) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState('')
  const [restart] = useState(() => restartPending(params))
  const isReader = params.get('as') === 'reader'
  const withName = isReader ? params.get('child') : params.get('reader')
  // This device started the call, so the reader's link was opened here by mistake (e.g. from the message it was
  // sent in): go to this device's own side instead.
  const ownSide = isReader && Object.values(read(LAST_CALLS) || {}).find(c => {
    try { return new URL(c.child).hash.includes(`r=${params.get('r')}&`) } catch { return false }
  })

  const join = async () => {
    setError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}},
        audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
      }))
    } catch (e) {
      setError(`Camera or microphone not available: ${e.message}`)
    }
  }
  useEffect(() => {
    if (ownSide) return goReplace(new URL(ownSide.child).hash.slice(1))
    // Straight in when this page has already been tapped (the parent pressed Start a call, so sound can play);
    // a freshly opened link needs one tap.
    if (params.get('preview') === '1' || restart || navigator.userActivation?.hasBeenActive) join()
  }, [])
  useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [stream])

  if (ownSide) return null
  if (stream) return <Call params={params} stream={stream} claim={!!restart?.claim} onRejoin={() => claimCall(params)} />
  return (
    <section id="join" className="screen on center">
      <h1 id="joinTitle">{withName ? `Storytime with ${withName}` : 'Storytime'}</h1>
      <button id="joinBtn" className="big" onClick={join}>Join</button>
      <p className="small">This turns on the camera and microphone.</p>
      {error && <p id="joinErr" className="warn">{error}</p>}
    </section>
  )
}

// onBlocked: the browser refused to start playback (sound needs a tap first, e.g. after a reconnect reloaded the page).
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

function Call({params, stream, claim, onRejoin}) {
  const isReader = params.get('as') === 'reader'
  const reader = params.get('reader') || 'the reader', child = params.get('child') || 'the child'
  const handlers = useRef({})
  const call = useCall(params, stream, {
    onPeerJoin: id => handlers.current.onPeerJoin?.(id),
    onMessage: msg => handlers.current.onMessage?.(msg),
  }, {claim})
  const [muted, setMuted] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useWakeLock()

  const toggleMute = () => {
    const track = stream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }
  const leave = () => leaveCallOnPurpose() || goReplace(read(SETUP) ? '' : (() => {
    const p = new URLSearchParams(params)
    for (const k of ['r', 'k', 'as', 'b', 'preview']) p.delete(k)
    return p
  })())

  const childSide = useChildBooks({params, call, handlers, reader, enabled: !isReader})
  const mySide = isReader ? reader : `${child}'s phone`
  if (call.replaced) return (
    <section id="moved" className="screen on center">
      <h1>The call moved to another screen</h1>
      <p>{mySide[0].toUpperCase() + mySide.slice(1)} opened the call somewhere else, so this screen stepped aside.</p>
      <button id="useHereBtn" className="big" onClick={onRejoin}>Use this screen</button>
      <button className="ghost" onClick={leave}>Leave</button>
    </section>
  )
  return (
    <section id="call" className={`screen on${isReader ? ' reader' : ''}`}>
      <div id="stage">
        <Video id="remote" stream={call.remote} muted={params.get('preview') === '1'} onBlocked={() => setBlocked(true)} />
        {blocked && <button id="tapToPlay" className="big" onClick={() => { document.getElementById('remote').play().catch(() => {}); setBlocked(false) }}>
          Tap to see and hear {isReader ? child : reader}</button>}
        {!call.remote && <Waiting params={params} isReader={isReader} reader={reader} child={child} />}
        {call.conflict && (
          <div id="conflict" className="overlay on">
            <div className="sheet">
              {isReader ? <>
                <h2>{reader[0].toUpperCase() + reader.slice(1)} is already using this link</h2>
                <p>This link is for {reader}. If you started the call, open your own side instead.</p>
                <button id="switchSideBtn" onClick={() => goReplace(otherSide(params))}>Open {child}'s side</button>
                <button id="takeOverBtn" className="ghost" onClick={call.takeOver}>I'm {reader}: use this screen</button>
              </> : <>
                <h2>This call is already open on another screen</h2>
                <button id="takeOverBtn" onClick={call.takeOver}>Use this screen</button>
                <button className="ghost" onClick={leave}>Leave</button>
              </>}
            </div>
          </div>
        )}
        <Video id="self" stream={stream} muted />
        <div id="status" className={call.status.cls}>{call.status.text}</div>
        {childSide?.overlay}
        <div id="bar">
          <button id="muteBtn" className={`ghost${muted ? ' off' : ''}`} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          {childSide?.bookButton}
          <button id="leaveBtn" className="ghost" onClick={leave}>Leave</button>
        </div>
      </div>
      {isReader && <ReaderBook params={params} call={call} handlers={handlers} />}
      {childSide?.picker}
    </section>
  )
}

// Before the other side arrives. The phone that started the call offers the reader's link right here, so sending it
// never takes the phone out of the call; the reader's side says who it's waiting for, and after a while what to do.
function Waiting({params, isReader, reader, child}) {
  const [long, setLong] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLong(true), 20000); return () => clearTimeout(t) }, [])
  if (isReader) return (
    <div id="waiting">
      <p>Waiting for {child}…</p>
      {long && <p className="small">Still waiting. The call starts when {child}'s phone opens it, so you may need to let them know you're here.</p>}
    </div>
  )
  const link = linkWith(otherSide(params))
  const title = params.get('child') ? `Storytime with ${params.get('child')}` : 'Storytime'
  return (
    <div id="waiting">
      <p>Waiting for {reader}.</p>
      <div className="row">
        {navigator.share && <button id="shareBtn" onClick={() => shareLink(link, title)}>Send {reader} the link</button>}
        <button id="copyBtn" className={navigator.share ? 'ghost' : ''} onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div id="linkbox">{link}</div>
      <p className="small">Stay on this screen; the call starts when {reader} opens the link.</p>
    </div>
  )
}

// The child's side: shows what the reader's tablet has open, nudges pages, picks books. Returns the pieces (badge
// and arrows over the video, a Book button in the bar, the picker sheet) rather than one subtree; on the reader's
// side (enabled false) it returns nothing.
function useChildBooks({params, call, handlers, reader, enabled}) {
  const [remoteState, setRemoteState] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  useBackLayer(pickerOpen, () => setPickerOpen(false))
  const pending = useRef(null)
  const {books} = useLibrary(params.get('lk'), params.get('lib'))
  const stack = (params.get('b') || '').split(',').filter(Boolean)

  if (!enabled) return {}
  handlers.current.onMessage = msg => {
    if (msg?.want) return
    if (msg && msg.id !== remoteState?.id) rememberBook(msg.id)
    setRemoteState(msg)
  }
  handlers.current.onPeerJoin = id => {
    if (pending.current) call.send({want: pending.current}, id)
    pending.current = null
  }
  const want = w => {
    if (call.connected) call.send({want: w})
    else pending.current = w  // sent when the reader joins
  }
  const cap = reader[0].toUpperCase() + reader.slice(1)

  return {
    overlay: remoteState && <>
      <div id="pageBadge">{cap}: {remoteState.title}, {remoteState.label}</div>
      <div id="childNav">
        <button id="childPrev" className="ghost" aria-label="Previous page" onClick={() => want({id: remoteState.id, page: remoteState.page - 1})}>◀</button>
        <button id="childNext" className="ghost" aria-label="Next page" onClick={() => want({id: remoteState.id, page: remoteState.page + 1})}>▶</button>
      </div>
    </>,
    bookButton: books?.length > 0 && <button id="bookBtn" className="ghost" onClick={() => setPickerOpen(true)}>Book</button>,
    picker: pickerOpen && books && (
      <div id="picker" className="overlay on" onClick={e => e.target === e.currentTarget && setPickerOpen(false)}>
        <div id="pickerSheet">
          <h2>Pick a book</h2>
          <Library id="pickerShelf" books={books} stack={stack} current={remoteState?.id}
            onPick={b => { want({id: b.id, page: 0}); setPickerOpen(false) }} />
          <button id="pickerClose" className="ghost" onClick={() => setPickerOpen(false)}>Close</button>
        </div>
      </div>
    ),
  }
}

// The reader's side: the shelf, then the open book with its words fitted to the space.
function ReaderBook({params, call, handlers}) {
  const lk = params.get('lk'), lib = params.get('lib')
  const stack = (params.get('b') || '').split(',').filter(Boolean)
  const {books, error: listError} = useLibrary(lk, lib)
  const [book, setBook] = useState(null)
  const [pageNo, setPageNo] = useState(0)
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')
  const [shelfOpen, setShelfOpen] = useState(false)
  useBackLayer(shelfOpen && !!book, () => setShelfOpen(false))
  const opened = useRef(false)
  const byId = entriesById(books)
  const entry = book && byId.get(book.id)
  const nextStory = entry?.next && byId.get(entry.next)

  const current = book && !shelfOpen ? {id: book.id, title: book.collection ? `${book.collection.title}: ${book.title}` : book.title, page: pageNo, label: pageLabel(book, pageNo)} : null
  const currentRef = useRef(current)
  currentRef.current = current

  const openBook = async (entry, page = 0) => {
    setShelfOpen(false)
    setLoading(entry.title)
    try {
      const b = await fetchBook(entry, lk, lib)
      setBook(b)
      setPageNo(Math.max(0, Math.min(b.pages.length - 1, page)))
      rememberBook(b.id)
    } catch (e) {
      setError(`Couldn't open ${entry.title} (${e.message}).`)
      setShelfOpen(true)
    }
    setLoading(null)
  }
  const goTo = i => book && setPageNo(Math.max(0, Math.min(book.pages.length - 1, i)))

  // Open tonight's first book (or the only book) once the list arrives.
  useEffect(() => {
    if (!books || opened.current) return
    opened.current = true
    const first = byId.get(stack[0]) || (books.length === 1 && !books[0].collection && books[0])
    if (first && !first.collection) openBook(first); else setShelfOpen(true)
  }, [books])

  // Tell the phone what is open whenever it changes, and the phone that just joined.
  useEffect(() => { call.send(current) }, [current?.id, current?.page])
  handlers.current.onPeerJoin = id => call.send(currentRef.current, id)
  handlers.current.onMessage = msg => {
    const w = msg?.want
    if (!w) return
    if (book && w.id === book.id) return goTo(w.page ?? pageNo)
    const target = byId.get(w.id)
    if (target && !target.collection) openBook(target, w.page ?? 0)
  }

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight') goTo(pageNo + 1)
      if (e.key === 'ArrowLeft') goTo(pageNo - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const title = loading ? `${loading}…` : shelfOpen || !book ? 'Pick a book'
    : book.collection ? `${book.collection.title} · ${book.title}` : book.title
  return (
    <div id="book">
      <div id="bookHead">
        <div id="bookTitle">{title}</div>
        <button id="shelfBtn" className="ghost" onClick={() => setShelfOpen(true)}>{book?.collection && !shelfOpen ? 'Contents' : 'All books'}</button>
      </div>
      {(error || listError || !books) && <div id="shelfMsg">{error || (listError ? `Couldn't open the books (${listError}).` : 'Loading books…')}</div>}
      {shelfOpen && books && <Library id="shelf" books={books} stack={stack} current={book?.id}
        openCollection={book?.collection?.id} onPick={b => { setError(''); openBook(b) }} />}
      {!shelfOpen && book && <Page book={book} pageNo={pageNo} goTo={goTo}
        nextStory={nextStory} onNextStory={() => openBook(nextStory)} />}
    </div>
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
        <button id="nextStory" className="ghost" onClick={onNextStory}>Next story: {nextStory.storyTitle} ▶</button>}
      <div id="nav">
        <button id="prevBtn" className="ghost" aria-label="Previous page" disabled={pageNo === 0} onClick={() => goTo(pageNo - 1)}>◀</button>
        <div id="pageNum">{pageLabel(book, pageNo)}</div>
        <button id="nextBtn" aria-label="Next page" disabled={pageNo === book.pages.length - 1} onClick={() => goTo(pageNo + 1)}>▶</button>
      </div>
      <div id="strip" ref={stripRef}>
        {book.pages.map((p, i) => (
          <img key={i} src={p.thumb} alt={pageLabel(book, i)} className={i === pageNo ? 'cur' : ''} onClick={() => goTo(i)} />
        ))}
      </div>
    </div>
  )
}
