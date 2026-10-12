// The video call: join the Trystero room named in the link, exchange camera streams, and pass small 'book'
// messages. A relay or join error rejoins in place. A peer whose video hasn't arrived 15 s after it was found, or
// one that keeps saying our video isn't reaching it, restarts the page as a new participant (rejoining in place
// keeps our peer id, and the other side may hold on to a dead connection). Only a wrong call secret, which
// retrying can't fix, is shown as an error.
import {useEffect, useRef, useState} from 'react'
import {joinRoom, selfId} from '../../vendor/trystero-nostr.js'
import {fromB64url} from './links.js'

const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
]
const APP_ID = 'storytime-jmandel-v1'

function config(params) {
  const cfg = {appId: APP_ID, password: params.get('k')}
  const relay = params.get('relay')
  cfg.relayConfig = {urls: relay ? relay.split(',') : DEFAULT_RELAYS}
  const turn = params.get('turn')
  if (turn) cfg.turnConfig = JSON.parse(new TextDecoder().decode(fromB64url(turn)))
  return cfg
}

// Whether the call goes directly between the devices or through a TURN relay.
async function connectionPath(pc) {
  const stats = await pc.getStats()
  let pair
  stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId) })
  if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s })
  if (!pair) return null
  const relayed = [stats.get(pair.localCandidateId), stats.get(pair.remoteCandidateId)].some(c => c?.candidateType === 'relay')
  return relayed ? 'through relay' : 'direct'
}

// Every screen in the room says hello every few seconds: its side ('reader' or 'child'), when it joined, whether
// it is in the foreground, and whether it is receiving our video. That lets each screen:
//  - show the right person: the other side's screen (in the foreground, longest in the call), never a second copy
//    of its own side (e.g. the parent opening the link meant for the reader);
//  - notice a second copy of its own side: a background copy steps aside for one in the foreground; otherwise the
//    newer copy asks what to do ({conflict}) and takes over only when told to (takeOver());
//  - repair a one-way call: if the other side keeps reporting that our video isn't arriving, leave and rejoin.
const HELLO_MS = 4000
const role = params => params.get('as') === 'reader' ? 'reader' : 'child'

// handlers: {onPeerJoin(id), onMessage(msg)}, read through a ref so they can change between renders.
// claim: this screen was told to take the call ("Use this screen"), so other copies of its side step aside.
// Returns {status: {text, cls}, remote: MediaStream|null, send(msg, targetId?), connected, conflict, replaced,
// takeOver()}.
export function useCall(params, stream, handlers, {claim = false} = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [status, setStatus] = useState({text: 'Waiting', cls: ''})
  const [remote, setRemote] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const api = useRef({send: () => {}, takeOver: () => {}, peerId: null})

  useEffect(() => {
    let room, retryTimer, watchdog, helloTimer, closed = false
    const state = api.current
    const me = {role: role(params), since: Date.now(), inst: Math.random().toString(36).slice(2)}
    const peers = new Map()  // peer id -> {role, since, inst, hidden, got, stream, joinedAt, missed}
    const peer = id => peers.get(id) || peers.set(id, {joinedAt: Date.now(), missed: 0}).get(id)
    window.__storytimeCall = {me, peers, state}  // for tests and debugging
    const older = (a, b) => a.since < b.since || (a.since === b.since && a.inst < b.inst)

    // The other side's screen to show: one that is still saying hello (a screen that was closed or reloaded can
    // linger for a while without saying goodbye), with video arriving, in the foreground, then the one in the call
    // longest. A screen that hasn't said hello yet (an older version of the app) still counts.
    const quiet = p => p.seen && Date.now() - p.seen > 2.5 * HELLO_MS
    const live = p => p.stream?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)
    const rank = p => [quiet(p) ? 1 : 0, live(p) ? 0 : 1, p.hidden ? 1 : 0, p.since ?? 0]
    const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false }
    function choose() {
      let best = null
      for (const [id, p] of peers) {
        if (!p.stream || p.role === me.role) continue
        if (!best || better(p, peers.get(best))) best = id
      }
      if (best === state.peerId) return
      state.peerId = best
      setRemote(best ? peers.get(best).stream : null)
      if (!best) return setStatus({text: 'Waiting', cls: ''})
      clearTimeout(watchdog)
      showPath(best)
    }
    async function showPath(id) {
      setStatus({text: 'Connected', cls: 'ok'})
      for (let i = 0; i < 10 && state.peerId === id && !closed; i++) {
        const pc = room.getPeers()[id]
        const path = pc && await connectionPath(pc)
        if (path && state.peerId === id) return setStatus({text: `Connected (${path})`, cls: 'ok'})
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    function stepAside() {
      closed = true
      clearTimeout(retryTimer); clearTimeout(watchdog); clearInterval(helloTimer)
      try { room?.leave() } catch {}
      state.peerId = null
      setRemote(null)
      setConflict(false)
      setReplaced(true)
    }

    function hello(target) {
      // got: frames are actually arriving (a connection can be up with its video track muted, e.g. after a rejoin).
      const got = id => !!peers.get(id)?.stream?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)
      const send = id => hi.send({...me, hidden: document.hidden, got: got(id)}, {target: id})
      if (target) send(target)
      else for (const id of Object.keys(room.getPeers())) send(id)
    }
    let hi
    function onHello(msg, id) {
      if (msg?.takeOver) return msg.role === me.role ? stepAside() : undefined
      const p = peer(id)
      Object.assign(p, {role: msg.role, since: msg.since, inst: msg.inst, hidden: msg.hidden, seen: Date.now()})
      if (p.role === me.role) {
        // Two copies of the same side. A background copy gives way to a foreground one; otherwise the newer one
        // asks (it may be the parent who opened the reader's link by mistake).
        if (claim && !document.hidden) hi.send({role: me.role, takeOver: true}, {target: id})
        else if (document.hidden && !p.hidden) return stepAside()
      } else {
        // The other side says our video isn't reaching them (after a grace period). Not while
        // we're in the background, where the phone may pause the camera on purpose.
        p.missed = msg.got === false && !document.hidden && Date.now() - p.joinedAt > 10000 ? p.missed + 1 : 0
        if (p.missed >= 3) return restart()
      }
      checkConflict()
      choose()
    }
    const checkConflict = () =>
      setConflict(!document.hidden && [...peers.values()].some(p => p.role === me.role && !p.hidden && !quiet(p) && older(p, me)))

    function connect() {
      peers.clear()
      room = joinRoom(config(params), params.get('r'), {
        onJoinError: d => {
          if (/password/i.test(d.error || '')) return setStatus({text: "Can't join: this link doesn't match the call", cls: 'warn'})
          reconnect()
        },
      })
      const action = room.makeAction('book')
      state.send = (msg, target) => action.send(msg, target ? {target} : undefined)
      // Book messages only from the screen we're showing (or anyone, before one is chosen).
      action.onMessage = (msg, from) => {
        const id = from?.peerId ?? from
        if (!state.peerId || id === state.peerId) handlersRef.current.onMessage?.(msg)
      }
      hi = room.makeAction('hello')
      hi.onMessage = (msg, from) => onHello(msg, from?.peerId ?? from)
      state.takeOver = () => {
        hi.send({role: me.role, takeOver: true})
        setConflict(false)
      }
      // Cameras go one way at a time: if both screens add theirs at the same moment the two renegotiations can
      // collide and one direction is lost. The screen with the lower id sends first; the other sends when that
      // video arrives (or after a few seconds, in case it never does).
      const sent = new Set()
      const sendCamera = id => { if (sent.has(id)) return; sent.add(id); room.addStream(stream, {target: id}) }
      room.onPeerJoin = id => {
        const p = peer(id)
        if (selfId < id) sendCamera(id)
        else p.sendTimer = setTimeout(() => sendCamera(id), 4000)
        hello(id)
        handlersRef.current.onPeerJoin?.(id)
        if (!state.peerId) setStatus({text: 'Connecting…', cls: ''})
        clearTimeout(watchdog)
        watchdog = setTimeout(() => { if (!state.peerId) restart() }, 15000)
      }
      room.onPeerStream = (s, id) => {
        clearTimeout(peer(id).sendTimer)
        sendCamera(id)
        peer(id).stream = s
        choose()
      }
      room.onPeerLeave = id => {
        clearTimeout(peers.get(id)?.sendTimer)
        sent.delete(id)
        peers.delete(id)
        checkConflict()
        choose()
      }
      clearInterval(helloTimer)
      helloTimer = setInterval(() => { hello(); checkConflict(); choose() }, HELLO_MS)
    }

    // Start over as a new participant: reload the page, which rejoins straight away (see restartPending). Rejoining
    // in place keeps our peer id, and the other side may then keep a stale connection that carries no video.
    function restart() {
      if (closed) return
      closed = true
      setStatus({text: 'Reconnecting…', cls: ''})
      try { room?.leave() } catch {}
      if (!markRestart(params, claim)) return setStatus({text: 'Trouble connecting. Leave and start the call again.', cls: 'warn'})
      setTimeout(() => location.reload(), 500)
    }

    // A relay or join error before any connection: rejoining in place is fine.
    function reconnect() {
      if (retryTimer || closed) return
      setStatus({text: 'Reconnecting…', cls: ''})
      clearInterval(helloTimer)
      try { room?.leave() } catch {}
      state.peerId = null
      setRemote(null)
      retryTimer = setTimeout(() => { retryTimer = null; if (!closed) connect() }, 2000 + Math.random() * 2000)
    }

    const onVisible = () => !closed && room && hello()
    document.addEventListener('visibilitychange', onVisible)
    connect()
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(retryTimer)
      clearTimeout(watchdog)
      clearInterval(helloTimer)
      state.send = () => {}
      state.takeOver = () => {}
      state.peerId = null
      try { room?.leave() } catch {}
    }
  }, [params.get('r'), params.get('k'), stream])

  return {
    status, remote, conflict, replaced,
    connected: !!remote,
    send: (msg, target) => api.current.send(msg, target),
    takeOver: () => api.current.takeOver(),
  }
}

// Restarts are remembered for the tab (sessionStorage) so the reloaded page rejoins without asking again; more than
// 4 in 3 minutes means something else is wrong, so stop and say so.
const RESTARTS = 'storytime-restarts'
function markRestart(params, claim) {
  let list = []
  try { list = JSON.parse(sessionStorage.getItem(RESTARTS)) || [] } catch {}
  list = list.filter(x => x.r === params.get('r') && Date.now() - x.at < 180000)
  if (list.length >= 4) return false
  list.push({r: params.get('r'), at: Date.now(), claim})
  try { sessionStorage.setItem(RESTARTS, JSON.stringify(list)) } catch { return false }
  return true
}
// Whether this page load is a restart of the call in the link (so join straight away), and whether it was claiming.
export function restartPending(params) {
  try {
    const list = JSON.parse(sessionStorage.getItem(RESTARTS)) || []
    const last = list.filter(x => x.r === params.get('r')).at(-1)
    return last && Date.now() - last.at < 30000 ? {claim: !!last.claim} : null
  } catch { return null }
}
// "Use this screen": reload as a new participant that takes the call from other copies of this side.
export function claimCall(params) {
  if (markRestart(params, true)) location.reload()
}

// Keep the screen on during a call.
export function useWakeLock() {
  useEffect(() => {
    let lock
    const take = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch {} }
    const onVisible = () => document.visibilityState === 'visible' && take()
    take()
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.().catch(() => {}) }
  }, [])
}
