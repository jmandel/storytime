// The video call: join the Trystero room named in the link, exchange camera streams, and pass small 'book'
// messages. Each attempt to join uses a fresh copy of the Trystero module, so it gets new relay connections and a new
// peer id: rejoining with the old ones can't work (a relay socket can die quietly, e.g. while the phone was in
// Messages sending the link, and the other side keeps a dead connection to the old id). A screen without the other
// side's video tries again by itself (see tick()). Only a wrong call secret, which retrying can't fix, is shown as an
// error.
import {useEffect, useRef, useState} from 'react'
import {fromB64url} from './links.js'

// Checked 2026-10-12 by tests/recover.mjs-style runs; offchain.pub was dropped for refusing our messages.
const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nostr.oxtr.dev',
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

// A fresh copy of Trystero for each attempt (the module keeps its relay sockets and peer id for good). The file is
// served next to the page (see the Pages workflow).
let copies = 0
const loadTrystero = () => import(new URL(`vendor/trystero-nostr.js?copy=${++copies}`, document.baseURI).href)

// Stop an abandoned copy: close its connections (so the other side notices we're gone) and its relay sockets (paused
// first, or they reconnect).
function retire(lib, room) {
  try { Object.values(room?.getPeers() || {}).forEach(pc => pc.close()) } catch {}
  try { room?.leave() } catch {}
  if (!lib) return
  lib.pauseRelayReconnection()
  Object.values(lib.getRelaySockets()).forEach(s => { try { s.close() } catch {} })
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
//  - repair a one-way call: if the other side keeps reporting that our video isn't arriving, join again.
const HELLO_MS = 4000
const role = params => params.get('as') === 'reader' ? 'reader' : 'child'

// handlers: {onPeerJoin(id), onMessage(msg)}, read through a ref so they can change between renders.
// claim: this screen was told to take the call ("Use this screen"), so other copies of its side step aside.
// Returns {status: {text, cls}, remote: MediaStream|null, connected, seeing (its video is arriving), send(msg, targetId?),
// conflict, replaced, takeOver(), retry()}.
export function useCall(params, stream, handlers, {claim = false} = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [status, setStatus] = useState({text: 'Waiting', cls: ''})
  const [remote, setRemote] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const [seeing, setSeeing] = useState(false)
  const api = useRef({send: () => {}, takeOver: () => {}, retry: () => {}, peerId: null})

  useEffect(() => {
    let lib, room, hi, helloTimer, visibleTimer, closed = false
    let selfId = ''
    let lastJoin = 0, lastGood = Date.now(), hiddenAt = 0, everConnected = false, passwordErrors = 0, path = ''
    const joins = []  // when each attempt started, for "still trying"
    const state = api.current
    const me = {role: role(params), since: Date.now(), inst: Math.random().toString(36).slice(2)}
    const peers = new Map()  // peer id -> {role, since, inst, hidden, got, stream, joinedAt, seen, missed, sendTimer}
    const peer = id => peers.get(id) || peers.set(id, {joinedAt: Date.now(), missed: 0}).get(id)
    window.__storytimeCall = {me, peers, state, joins}  // for tests and debugging
    const older = (a, b) => a.since < b.since || (a.since === b.since && a.inst < b.inst)

    // The other side's screen to show: one that is still saying hello (a screen that was closed or reloaded can
    // linger for a while without saying goodbye), with video arriving, in the foreground, then the one in the call
    // longest. A screen that hasn't said hello yet might be a second copy of our own side, so it waits a few seconds
    // (an older version of the app never says hello, and still counts after that).
    const quiet = p => p.seen && Date.now() - p.seen > 2.5 * HELLO_MS
    const live = p => !!p?.stream?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)
    const otherSide = p => p.role ? p.role !== me.role : Date.now() - p.joinedAt > 5000
    const rank = p => [quiet(p) ? 1 : 0, live(p) ? 0 : 1, p.hidden ? 1 : 0, p.since ?? 0]
    const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false }
    function choose() {
      let best = null
      for (const [id, p] of peers) {
        if (!p.stream || !otherSide(p)) continue
        if (!best || better(p, peers.get(best))) best = id
      }
      if (best !== state.peerId) {
        state.peerId = best
        path = ''
        setRemote(best ? peers.get(best).stream : null)
        if (best) findPath(best)
      }
      showStatus()
    }
    // "Connected" only once the other side's video is actually arriving: a connection can be up while its video
    // never comes.
    function showStatus() {
      if (closed) return
      const p = state.peerId && peers.get(state.peerId)
      setSeeing(live(p))
      if (live(p)) return setStatus({text: path ? `Connected (${path})` : 'Connected', cls: 'ok'})
      const recent = joins.filter(t => Date.now() - t < 180000).length
      if (recent > 4) return setStatus({text: 'Having trouble connecting. Still trying…', cls: 'warn'})
      const here = [...peers.values()].some(q => q.role ? q.role !== me.role : true)
      setStatus({text: p || here ? 'Connecting…' : 'Waiting', cls: ''})
    }
    async function findPath(id) {
      for (let i = 0; i < 10 && state.peerId === id && !closed; i++) {
        const pc = room.getPeers()[id]
        const found = pc && await connectionPath(pc)
        if (found && state.peerId === id) { path = found; return showStatus() }
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    function stepAside() {
      closed = true
      clearInterval(helloTimer); clearTimeout(visibleTimer)
      retire(lib, room)
      state.peerId = null
      setRemote(null)
      setConflict(false)
      setReplaced(true)
    }

    function hello(target) {
      if (!hi) return
      // got: frames are actually arriving (a connection can be up with its video track muted).
      const send = id => hi.send({...me, hidden: document.hidden, got: live(peers.get(id))}, {target: id})
      if (target) send(target)
      else for (const id of Object.keys(room.getPeers())) send(id)
    }
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
        // The other side says our video isn't reaching them (after a grace period). Not while we're in the
        // background, where the phone may pause the camera on purpose.
        p.missed = msg.got === false && !document.hidden && Date.now() - p.joinedAt > 10000 ? p.missed + 1 : 0
        if (p.missed >= 3) return rejoin()
      }
      checkConflict()
      choose()
    }
    let conflictNow = false
    const checkConflict = () => setConflict(conflictNow =
      !document.hidden && [...peers.values()].some(p => p.role === me.role && !p.hidden && !quiet(p) && older(p, me)))

    // Every few seconds: say hello, and if the other side's video isn't arriving, try again with fresh connections.
    // With the other side here but no video, after 20 s; with nobody here, every 45 s (they may not have opened the
    // link yet, or our relay connections may have died quietly, so nobody could find us). Not in the background,
    // where timers are slowed and the camera may be paused; coming back checks straight away (onVisible).
    function tick() {
      hello(); checkConflict(); choose()
      const now = Date.now()
      if (live(peers.get(state.peerId))) { lastGood = now; everConnected = true; return }
      if (document.hidden || conflictNow) return
      const here = [...peers.values()].some(p => otherSide(p) && !quiet(p))
      if (now - Math.max(lastGood, lastJoin) > (here ? 20000 : 45000)) rejoin()
    }

    async function connect() {
      lastJoin = Date.now()
      joins.push(lastJoin)
      const copy = await loadTrystero()
      if (closed) return
      lib = copy
      selfId = lib.selfId
      peers.clear()
      state.peerId = null
      setRemote(null)
      showStatus()
      const myRoom = room = lib.joinRoom(config(params), params.get('r'), {
        onJoinError: d => {
          if (myRoom !== room) return
          // A wrong secret can't be fixed by trying again; but a single garbled message can look the same, so only
          // say so when it keeps happening before anything ever connected.
          if (/password/i.test(d.error || '') && !everConnected && ++passwordErrors >= 3) {
            closed = true
            retire(lib, room)
            return setStatus({text: "Can't join: this link doesn't match the call", cls: 'warn'})
          }
          // A failed connection to some other screen (an old copy, a stale tab) while the call works: ignore it.
          if (live(peers.get(state.peerId))) return
          rejoin()
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
        setConflict(conflictNow = false)
      }
      // Cameras go one way at a time: if both screens add theirs at the same moment the two renegotiations can
      // collide and one direction is lost. The screen with the lower id sends first; the other sends when that
      // video arrives (or after a few seconds, in case it never does).
      const sent = new Set()
      const sendCamera = id => { if (sent.has(id) || myRoom !== room) return; sent.add(id); room.addStream(stream, {target: id}) }
      room.onPeerJoin = id => {
        const p = peer(id)
        if (selfId < id) sendCamera(id)
        else p.sendTimer = setTimeout(() => sendCamera(id), 4000)
        hello(id)
        handlersRef.current.onPeerJoin?.(id)
        showStatus()
      }
      room.onPeerStream = (s, id) => {
        clearTimeout(peer(id).sendTimer)
        sendCamera(id)
        peer(id).stream = s
        s.getVideoTracks().forEach(t => t.addEventListener('unmute', choose))
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
      helloTimer = setInterval(tick, HELLO_MS)
    }

    // Join again as a new participant (fresh relay connections, new peer id), at most every 8 s.
    function rejoin() {
      if (closed || Date.now() - lastJoin < 8000) return
      clearInterval(helloTimer)
      for (const p of peers.values()) clearTimeout(p.sendTimer)
      retire(lib, room)
      lib = room = hi = null
      state.send = () => {}
      connect()
    }
    state.retry = () => { lastJoin = 0; rejoin() }

    // Back from the background (e.g. after sending the link from Messages): relay sockets may have died while the
    // page was frozen, so without the other side's video, join again now rather than waiting.
    const onVisible = () => {
      if (closed) return
      if (document.hidden) { hiddenAt = Date.now(); return }
      hello()
      const away = hiddenAt && Date.now() - hiddenAt > 10000
      hiddenAt = 0
      clearTimeout(visibleTimer)
      visibleTimer = setTimeout(() => { if (!live(peers.get(state.peerId)) && !conflictNow) { lastJoin = 0; rejoin() } }, away ? 1500 : 6000)
    }
    const onOnline = () => !closed && !live(peers.get(state.peerId)) && (lastJoin = 0, rejoin())
    // The camera stopped for good (another app took it): reload to get it back.
    const onEnded = () => !closed && restart()
    function restart() {
      closed = true
      retire(lib, room)
      if (!markRestart(params, claim)) return setStatus({text: 'The camera stopped. Leave and start the call again.', cls: 'warn'})
      setStatus({text: 'Reconnecting…', cls: ''})
      setTimeout(() => location.reload(), 500)
    }
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', onOnline)
    stream.getTracks().forEach(t => t.addEventListener('ended', onEnded))
    connect()
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onOnline)
      stream.getTracks().forEach(t => t.removeEventListener('ended', onEnded))
      clearTimeout(visibleTimer)
      clearInterval(helloTimer)
      state.send = () => {}
      state.takeOver = () => {}
      state.retry = () => {}
      state.peerId = null
      retire(lib, room)
    }
  }, [params.get('r'), params.get('k'), stream])

  return {
    status, remote, conflict, replaced,
    connected: !!remote, seeing,
    send: (msg, target) => api.current.send(msg, target),
    takeOver: () => api.current.takeOver(),
    retry: () => api.current.retry(),
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
