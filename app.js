import {joinRoom} from './vendor/trystero-nostr.js'

// Link format (everything lives after '#', so it never reaches the web server):
//   #r=<room>&k=<secret>&as=grandma|kid[&relay=wss://a,wss://b][&turn=<base64url JSON iceServers>]
// relay overrides the default Nostr relays; turn adds TURN servers for networks that block direct calls.
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
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomId = n => b64url(crypto.getRandomValues(new Uint8Array(n)))
const fromB64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

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
  if (turn) cfg.turnConfig = JSON.parse(fromB64url(turn))
  return cfg
}

// Start screen: make a fresh room and secret for this call.
$('startBtn').onclick = () => {
  const p = new URLSearchParams(params)
  p.set('r', randomId(12))
  p.set('k', randomId(18))
  const grandma = linkFor('grandma', p)
  $('linkbox').textContent = grandma
  $('shareBtn').style.display = navigator.share ? '' : 'none'
  $('shareBtn').onclick = () => navigator.share({title: 'Storytime with Cleo', url: grandma}).catch(() => {})
  $('copyBtn').onclick = async () => {
    await navigator.clipboard.writeText(grandma)
    $('copyBtn').textContent = 'Copied'
  }
  $('goBtn').onclick = () => { location.hash = new URL(linkFor('kid', p)).hash; location.reload() }
  show('invite')
}

let room, selfStream, peerId = null

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
  show('call')
  waiting(true)
  keepAwake()

  room = joinRoom(config(), params.get('r'), {
    onJoinError: d => status(`Can't join: ${d.error || 'wrong link?'}`, 'warn'),
  })
  room.onPeerJoin = id => {
    room.addStream(selfStream, {target: id})
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

const other = () => params.get('as') === 'grandma' ? 'Cleo' : 'Grandma'

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
  location.hash = ''
  location.reload()
}

if (params.get('r') && params.get('k')) {
  $('joinTitle').textContent = params.get('as') === 'grandma' ? 'Storytime with Cleo' : 'Storytime with Grandma'
  $('joinBtn').onclick = join
  show('join')
} else {
  show('start')
}
