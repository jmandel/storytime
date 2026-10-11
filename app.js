import {joinRoom} from './vendor/trystero-nostr.js'

// Link format (everything lives after '#', so it never reaches the web server):
//   #r=<room>&k=<secret>&as=reader|child&lk=<library key>
//   optional: &reader=<name>&child=<name> (shown in the app, e.g. reader=Grandma&child=Cleo)
//   optional: &b=<book id> (the book to open first)
//             &lib=<url of the encrypted books folder> (default: books/ next to this page)
//             &relay=wss://a,wss://b (our own signaling relays instead of the defaults)
//             &turn=<base64url JSON iceServers> (TURN servers for networks that block direct calls)
//             &preview=1 (join straight away with incoming audio muted; used by preview.html)
const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
]
const APP_ID = 'storytime-jmandel-v1'

const $ = id => document.getElementById(id)
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id))

const params = new URLSearchParams(location.hash.slice(1))
const isReader = params.get('as') === 'reader'
const readerName = params.get('reader'), childName = params.get('child')
const reader = readerName || 'the reader', child = childName || 'the child'
const cap = t => t[0].toUpperCase() + t.slice(1)
const preview = params.get('preview') === '1'
document.body.classList.toggle('reader', isReader)

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const randomId = n => b64url(crypto.getRandomValues(new Uint8Array(n)))

function linkFor(role, base) {
  const p = new URLSearchParams(base)
  p.set('as', role)
  return `${location.origin}${location.pathname}#${p}`
}

function config() {
  const cfg = {appId: APP_ID, password: params.get('k')}
  const relay = params.get('relay')
  cfg.relayConfig = {urls: relay ? relay.split(',') : DEFAULT_RELAYS}
  const turn = params.get('turn')
  if (turn) cfg.turnConfig = JSON.parse(new TextDecoder().decode(fromB64url(turn)))
  return cfg
}

// Start screen: a fresh room and secret for this call; library and relay settings carry over.
$('startBtn').onclick = () => {
  const p = new URLSearchParams(params)
  p.set('r', randomId(12))
  p.set('k', randomId(18))
  if (startPick) p.set('b', startPick); else p.delete('b')
  const readerLink = linkFor('reader', p)
  $('linkbox').textContent = readerLink
  $('shareBtn').style.display = navigator.share ? '' : 'none'
  $('shareBtn').onclick = () => navigator.share({title: childName ? `Storytime with ${childName}` : 'Storytime', url: readerLink}).catch(() => {})
  $('copyBtn').onclick = async () => {
    await navigator.clipboard.writeText(readerLink)
    $('copyBtn').textContent = 'Copied'
  }
  $('goBtn').onclick = () => { location.hash = new URL(linkFor('child', p)).hash; location.reload() }
  show('invite')
}

let room, selfStream, peerId = null, sendState = () => {}

async function join() {
  $('joinErr').textContent = ''
  try {
    selfStream = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}},
      audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
    })
  } catch (e) {
    $('joinErr').textContent = `Camera or microphone not available: ${e.message}`
    return
  }
  $('self').srcObject = selfStream
  $('remote').muted = preview
  show('call')
  waiting(true)
  keepAwake()
  if (isReader) loadShelf()
  else if (params.get('lk')) setupChildBooks()

  room = joinRoom(config(), params.get('r'), {
    onJoinError: d => status(`Can't join: ${d.error || 'wrong link?'}`, 'warn'),
  })
  const action = room.makeAction('book')
  sendState = (data, target) => action.send(data, target ? {target} : undefined)
  action.onMessage = msg => {
    if (isReader && msg?.want) return follow(msg.want)
    if (!isReader) showRemoteState(msg)
  }
  room.onPeerJoin = id => {
    room.addStream(selfStream, {target: id})
    sendState(isReader ? currentPage() : pendingWant && {want: pendingWant}, id)
    pendingWant = null
    status('Connecting…')
  }
  room.onPeerStream = (stream, id) => {
    peerId = id
    $('remote').srcObject = stream
    waiting(false)
    reportPath(id)
  }
  room.onPeerLeave = id => {
    if (id !== peerId) return
    peerId = null
    $('remote').srcObject = null
    waiting(true)
  }
}

const other = () => isReader ? child : reader

function waiting(on) {
  $('waiting').textContent = on ? `Waiting for ${other()}…` : ''
  if (on) status('Waiting')
}

function status(text, cls = '') {
  $('status').textContent = text
  $('status').className = cls
}

// Show whether the call goes directly between the devices or through a TURN relay.
async function reportPath(id) {
  for (let i = 0; i < 10 && peerId === id; i++) {
    const pc = room.getPeers()[id]
    if (pc) {
      const stats = await pc.getStats()
      let pair
      stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId) })
      if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s })
      if (pair) {
        const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId)
        const relayed = [local, remote].some(c => c?.candidateType === 'relay')
        status(relayed ? 'Connected (through relay)' : 'Connected (direct)', 'ok')
        return
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  status('Connected', 'ok')
}

async function keepAwake() {
  try {
    let lock = await navigator.wakeLock?.request('screen')
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen')
    })
  } catch {}
}

// Books: encrypted files (12-byte IV + AES-GCM ciphertext of JSON) opened with the library key from the link.
const libBase = new URL(params.get('lib') || 'books/', location.href)
let libKey, book = null, pageNo = 0, shelfBooks = []

async function openSealed(file) {
  libKey ??= await crypto.subtle.importKey('raw', fromB64url(params.get('lk')), 'AES-GCM', false, ['decrypt'])
  const res = await fetch(new URL(file, libBase))
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.slice(0, 12)}, libKey, buf.slice(12))
  return JSON.parse(new TextDecoder().decode(plain))
}

async function loadShelf() {
  if (!params.get('lk')) { $('shelfMsg').textContent = 'No books in this link.'; return }
  $('shelfMsg').textContent = 'Loading books…'
  try {
    const {books} = await openSealed('index.bin')
    $('shelf').replaceChildren(...books.map(b => {
      const btn = document.createElement('button')
      const img = document.createElement('img')
      img.src = b.cover
      img.alt = ''
      btn.append(img, b.title)
      btn.onclick = () => openBook(b)
      return btn
    }))
    $('shelfMsg').textContent = ''
    shelfBooks = books
    const first = books.find(b => b.id === params.get('b')) || (books.length === 1 && books[0])
    if (first) openBook(first)
    else showShelf()
  } catch (e) {
    $('shelfMsg').textContent = `Couldn't open the books (${e.message}).`
  }
}

function showShelf() {
  book = null
  $('bookTitle').textContent = 'Pick a book'
  $('reader').style.display = 'none'
  $('shelf').classList.add('on')
  sendState(null)
}

async function openBook(entry, startPage = 0) {
  $('shelf').classList.remove('on')
  $('bookTitle').textContent = `${entry.title}…`
  try {
    book = await openSealed(entry.file)
  } catch (e) {
    $('shelfMsg').textContent = `Couldn't open ${entry.title} (${e.message}).`
    return showShelf()
  }
  $('bookTitle').textContent = book.title
  $('strip').replaceChildren(...book.pages.map((p, i) => {
    const img = document.createElement('img')
    img.src = p.thumb
    img.alt = pageLabel(i)
    img.onclick = () => goTo(i)
    return img
  }))
  $('reader').style.display = 'flex'
  goTo(startPage)
}

const pageLabel = i => book.pages[i].label || `Page ${i}`
const currentPage = () => book && {id: book.id, title: book.title, page: pageNo, label: pageLabel(pageNo)}

function goTo(i) {
  if (!book) return
  pageNo = Math.max(0, Math.min(book.pages.length - 1, i))
  const p = book.pages[pageNo]
  $('pageImg').src = p.img
  $('pageNote').textContent = p.note || ''
  $('pageText').textContent = p.text
  $('pageText').scrollTop = 0
  fitText()
  $('pageNum').textContent = pageLabel(pageNo)
  $('prevBtn').disabled = pageNo === 0
  $('nextBtn').disabled = pageNo === book.pages.length - 1
  ;[...$('strip').children].forEach((img, j) => img.classList.toggle('cur', j === pageNo))
  $('strip').children[pageNo]?.scrollIntoView({inline: 'center', block: 'nearest', behavior: 'smooth'})
  sendState(currentPage())
}

// The reader's tablet: apply a book/page change asked for from the phone.
function follow(want) {
  if (book && want.id === book.id) return goTo(want.page ?? pageNo)
  const entry = shelfBooks.find(b => b.id === want.id)
  if (entry) openBook(entry, want.page ?? 0)
}

// The phone: pick books before and during the call, nudge pages, and show what the reader's tablet has open.
let startPick = null, pendingWant = null, remoteState = null

function renderShelf(el, books, current, onPick) {
  el.replaceChildren(...books.map(b => {
    const btn = document.createElement('button')
    const img = document.createElement('img')
    img.src = b.cover
    img.alt = ''
    btn.append(img, b.title)
    btn.classList.toggle('cur', b.id === current)
    btn.onclick = () => onPick(b)
    return btn
  }))
}

async function setupStartShelf() {
  if (!params.get('lk')) return
  try {
    const {books} = await openSealed('index.bin')
    startPick = books.find(b => b.id === params.get('b'))?.id || books[0]?.id
    const draw = () => renderShelf($('startShelf'), books, startPick, b => { startPick = b.id; draw() })
    draw()
  } catch {}
}

async function setupChildBooks() {
  let books
  try { ({books} = await openSealed('index.bin')) } catch { return }
  $('bookBtn').style.display = ''
  $('bookBtn').onclick = () => {
    renderShelf($('pickerShelf'), books, remoteState?.id, b => {
      want({id: b.id, page: 0})
      $('picker').classList.remove('on')
    })
    $('picker').classList.add('on')
  }
  $('pickerClose').onclick = () => $('picker').classList.remove('on')
  $('childPrev').onclick = () => remoteState && want({id: remoteState.id, page: remoteState.page - 1})
  $('childNext').onclick = () => remoteState && want({id: remoteState.id, page: remoteState.page + 1})
}

function want(w) {
  if (peerId) sendState({want: w})
  else pendingWant = w  // sent when the reader joins
}

function showRemoteState(p) {
  remoteState = p
  $('pageBadge').style.display = p ? 'block' : 'none'
  $('childNav').style.display = p ? 'flex' : 'none'
  if (p) $('pageBadge').textContent = `${cap(reader)}: ${p.title}, ${p.label}`
}

// Largest type (up to 64px) at which the whole page's words fit their box, whatever the screen.
// If the words would end up small, hide the page picture (the real book is on the video anyway) and fit again.
// Below MIN_TEXT the words stay at MIN_TEXT and the box scrolls, with a "more" cue.
const MIN_TEXT = 22
function fitText() {
  $('reader').classList.remove('noimg')
  if (fitSize() < 26 && $('pageImg').offsetHeight) {
    $('reader').classList.add('noimg')
    fitSize()
  }
  moreCue()
}
function moreCue() {
  const el = $('pageText')
  $('textWrap').classList.toggle('more', el.scrollTop + el.clientHeight < el.scrollHeight - 4)
}
function fitSize() {
  const el = $('pageText')
  if (!el.clientHeight) return 99
  let lo = MIN_TEXT, hi = 64
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    el.style.fontSize = `${mid}px`
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) lo = mid
    else hi = mid
  }
  el.style.fontSize = `${lo}px`
  return lo
}
addEventListener('resize', () => fitText())
$('pageText').addEventListener('scroll', moreCue)

$('prevBtn').onclick = () => goTo(pageNo - 1)
$('nextBtn').onclick = () => goTo(pageNo + 1)
$('shelfBtn').onclick = showShelf
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') goTo(pageNo + 1)
  if (e.key === 'ArrowLeft') goTo(pageNo - 1)
})

$('muteBtn').onclick = () => {
  const track = selfStream?.getAudioTracks()[0]
  if (!track) return
  track.enabled = !track.enabled
  $('muteBtn').textContent = track.enabled ? 'Mute' : 'Unmute'
  $('muteBtn').classList.toggle('off', !track.enabled)
}
$('leaveBtn').onclick = () => {
  room?.leave()
  selfStream?.getTracks().forEach(t => t.stop())
  const p = new URLSearchParams(params)
  ;['r', 'k', 'as'].forEach(k => p.delete(k))
  location.hash = p.toString()
  location.reload()
}

if (params.get('r') && params.get('k')) {
  const with_ = isReader ? childName : readerName
  $('joinTitle').textContent = with_ ? `Storytime with ${with_}` : 'Storytime'
  $('joinBtn').onclick = join
  show('join')
  if (preview) join()
} else {
  $('startText').textContent = `Start a call here, then send the link to ${reader}.`
  $('inviteTitle').textContent = `Send this to ${reader}`
  show('start')
  setupStartShelf()
}
