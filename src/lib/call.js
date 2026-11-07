// The family call: join the family's Trystero room (named by the family key), exchange camera streams with everyone
// there, and pass small 'book' messages. Each attempt to join uses a fresh copy of the Trystero module, so it gets new relay connections and a new
// peer id: rejoining with the old ones can't work (a relay socket can die quietly, e.g. while the phone was in
// Messages sending the link, and the other side keeps a dead connection to the old id). A screen missing someone's
// video tries again by itself (see tick()). Only a wrong call secret, which retrying can't fix, is shown as an
// error.
import {useEffect, useRef, useState} from 'react'
import {fromB64url} from './links.js'
import {roomOf, secretOf} from './family.js'

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

function config(family, password) {
  const cfg = {appId: APP_ID, password}
  const relay = family.relay
  cfg.relayConfig = {urls: relay ? relay.split(',') : DEFAULT_RELAYS}
  const turn = family.turn
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

// Every screen in the family room says hello every few seconds: who it is (name, and a device id so two tabs on one
// device can tell), when it joined, whether it is in the foreground, and which screens' video is reaching it. That
// lets each screen:
//  - show everyone else who is still saying hello (a screen that was closed or reloaded can linger for a while);
//  - notice a second tab of its own device: the newest one in the foreground keeps the call, the other steps aside;
//  - repair a one-way connection: if someone keeps reporting that our video isn't arriving, join again.
const HELLO_MS = 4000

// people: [{id, name, stream, live (video arriving), since}] in the order they joined, not including this screen.
// handlers: {onPeerJoin(id), onMessage(msg, id)}, read through a ref so they can change between renders.
// Returns {status: {text, cls}, people, alone, send(msg, targetId?), replaced, retry()}.
export function useCall(family, self, stream, handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [status, setStatus] = useState({text: 'Joining…', cls: ''})
  const [people, setPeople] = useState([])
  const [replaced, setReplaced] = useState(false)
  const api = useRef({send: () => {}, retry: () => {}})

  useEffect(() => {
    let lib, room, hi, helloTimer, visibleTimer, closed = false
    let selfId = ''
    let lastJoin = 0, lastGood = Date.now(), hiddenAt = 0, everConnected = false, passwordErrors = 0
    const joins = []  // when each attempt started, for "still trying"
    const state = api.current
    const me = {name: self.name, device: self.device, since: Date.now(), inst: Math.random().toString(36).slice(2)}
    const peers = new Map()  // peer id -> {name, device, since, hidden, got: [ids], stream, joinedAt, seen, missed, sendTimer}
    const peer = id => peers.get(id) || peers.set(id, {joinedAt: Date.now(), missed: 0}).get(id)
    window.__storytimeCall = {me, peers, state, joins}  // for tests and debugging

    const quiet = p => p.seen && Date.now() - p.seen > 2.5 * HELLO_MS
    const live = p => !!p?.stream?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)
    // Others: everyone but a second tab of this device and screens that went quiet.
    const others = () => [...peers.entries()].filter(([, p]) => p.device !== me.device && !quiet(p))
    function show() {
      if (closed) return
      const list = others().filter(([, p]) => p.stream || p.name)
        .sort(([, a], [, b]) => (a.since ?? a.joinedAt) - (b.since ?? b.joinedAt))
        .map(([id, p]) => ({id, name: p.name || '', stream: p.stream || null, live: live(p), since: p.since}))
      setPeople(list)
      const recent = joins.filter(t => Date.now() - t < 180000).length
      if (list.some(p => p.live)) return setStatus({text: '', cls: 'ok'})
      if (recent > 4) return setStatus({text: 'Having trouble connecting. Still trying…', cls: 'warn'})
      setStatus({text: list.length ? 'Connecting…' : 'Waiting for the family', cls: ''})
    }

    function stepAside() {
      closed = true
      clearInterval(helloTimer); clearTimeout(visibleTimer)
      retire(lib, room)
      setPeople([])
      setReplaced(true)
    }

    function hello(target) {
      if (!hi) return
      const got = [...peers.entries()].filter(([, p]) => live(p)).map(([id]) => id)
      const msg = {...me, hidden: document.hidden, got}
      if (target) hi.send(msg, {target})
      else for (const id of Object.keys(room.getPeers())) hi.send(msg, {target: id})
    }
    function onHello(msg, id) {
      const p = peer(id)
      Object.assign(p, {name: msg.name, device: msg.device, since: msg.since, inst: msg.inst, hidden: msg.hidden, seen: Date.now()})
      handlersRef.current.onPerson?.(msg.name)
      if (p.device === me.device) {
        // Another tab of this device: the newest one in the foreground keeps the call.
        const newer = p.since > me.since || (p.since === me.since && p.inst > me.inst)
        if (document.hidden && !p.hidden) return stepAside()
        if (newer && !p.hidden) return stepAside()
        return show()
      }
      // They say our video isn't reaching them (after a grace period); not while we're in the background, where the
      // phone may pause the camera on purpose.
      const missing = Array.isArray(msg.got) && !msg.got.includes(selfId)
      p.missed = missing && !document.hidden && Date.now() - p.joinedAt > 10000 ? p.missed + 1 : 0
      if (p.missed >= 3) return rejoin()
      show()
    }

    // Every few seconds: say hello, and if someone's video isn't arriving, try again with fresh connections. With
    // someone here but their video missing, after 20 s; with nobody here, every 45 s (they may be waiting behind
    // dead relay connections). Not in the background, where timers are slowed and the camera may be paused.
    function tick() {
      hello(); show()
      const now = Date.now()
      const here = others()
      if (here.length && here.every(([, p]) => live(p))) { lastGood = now; everConnected = true; return }
      if (document.hidden) return
      if (now - Math.max(lastGood, lastJoin) > (here.length ? 20000 : 45000)) rejoin()
    }

    async function connect() {
      lastJoin = Date.now()
      joins.push(lastJoin)
      const [copy, roomName, password] = await Promise.all([loadTrystero(), roomOf(family.f, family.room), secretOf(family.f)])
      if (closed) return
      lib = copy
      selfId = lib.selfId
      peers.clear()
      show()
      const myRoom = room = lib.joinRoom(config(family, password), roomName, {
        onJoinError: d => {
          if (myRoom !== room) return
          // A wrong secret can't be fixed by trying again; but a single garbled message can look the same, so only
          // say so when it keeps happening before anything ever connected.
          if (/password/i.test(d.error || '') && !everConnected && ++passwordErrors >= 3) {
            closed = true
            retire(lib, room)
            return setStatus({text: "Can't join: this family link doesn't match", cls: 'warn'})
          }
          if (others().some(([, p]) => live(p))) return  // a stale screen failing while the call works: ignore
          rejoin()
        },
      })
      const action = room.makeAction('book')
      state.send = (msg, target) => action.send(msg, target ? {target} : undefined)
      action.onMessage = (msg, from) => handlersRef.current.onMessage?.(msg, from?.peerId ?? from)
      state.action = name => room.makeAction(name)
      hi = room.makeAction('hello')
      hi.onMessage = (msg, from) => onHello(msg, from?.peerId ?? from)
      // Cameras go one way at a time per pair: if both screens add theirs at the same moment the two
      // renegotiations can collide and one direction is lost. The lower id sends first; the other when that video
      // arrives (or after a few seconds, in case it never does).
      const sent = new Set()
      const sendCamera = id => { if (sent.has(id) || myRoom !== room) return; sent.add(id); room.addStream(stream, {target: id}) }
      room.onPeerJoin = id => {
        const p = peer(id)
        if (selfId < id) sendCamera(id)
        else p.sendTimer = setTimeout(() => sendCamera(id), 4000)
        hello(id)
        handlersRef.current.onPeerJoin?.(id)
        show()
      }
      room.onPeerStream = (s, id) => {
        clearTimeout(peer(id).sendTimer)
        sendCamera(id)
        peer(id).stream = s
        s.getVideoTracks().forEach(t => t.addEventListener('unmute', show))
        show()
      }
      room.onPeerLeave = id => {
        clearTimeout(peers.get(id)?.sendTimer)
        sent.delete(id)
        peers.delete(id)
        show()
      }
      handlersRef.current.onRoom?.(room)
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
    // page was frozen, so unless everyone's video is arriving, join again now rather than waiting.
    const allLive = () => { const h = others(); return h.length > 0 && h.every(([, p]) => live(p)) }
    const onVisible = () => {
      if (closed) return
      if (document.hidden) { hiddenAt = Date.now(); return }
      hello()
      const away = hiddenAt && Date.now() - hiddenAt > 10000
      hiddenAt = 0
      clearTimeout(visibleTimer)
      visibleTimer = setTimeout(() => { if (!allLive()) { lastJoin = 0; rejoin() } }, away ? 1500 : 6000)
    }
    const onOnline = () => !closed && !allLive() && (lastJoin = 0, rejoin())
    // The camera stopped for good (another app took it): reload to get it back.
    const onEnded = () => !closed && restart()
    function restart() {
      closed = true
      retire(lib, room)
      if (!markRestart()) return setStatus({text: 'The camera stopped. Leave and join again.', cls: 'warn'})
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
      state.retry = () => {}
      retire(lib, room)
    }
  }, [family.f, stream])

  return {
    status, people, replaced, alone: !people.some(p => p.live),
    send: (msg, target) => api.current.send(msg, target),
    retry: () => api.current.retry(),
  }
}

// Restarts are remembered for the tab (sessionStorage) so the reloaded page rejoins without asking again; more than
// 4 in 3 minutes means something else is wrong, so stop and say so.
const RESTARTS = 'storytime-restarts'
export function markRestart() {
  let list = []
  try { list = JSON.parse(sessionStorage.getItem(RESTARTS)) || [] } catch {}
  list = list.filter(at => Date.now() - at < 180000)
  if (list.length >= 4) return false
  list.push(Date.now())
  try { sessionStorage.setItem(RESTARTS, JSON.stringify(list)) } catch { return false }
  return true
}
// Whether this page load is a restart of the call (so join straight away).
export function restartPending() {
  try { return (JSON.parse(sessionStorage.getItem(RESTARTS)) || []).some(at => Date.now() - at < 30000) } catch { return false }
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
