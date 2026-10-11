// The video call: join the Trystero room named in the link, exchange camera streams, and pass small 'book'
// messages. Connection attempts sometimes fail (a slow relay, a network hiccup), so a failed attempt, or a peer
// whose video hasn't arrived 15 s after it was found, makes us leave and rejoin. Only a wrong call secret, which
// retrying can't fix, is shown as an error.
import {useEffect, useRef, useState} from 'react'
import {joinRoom} from '../../vendor/trystero-nostr.js'
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

// handlers: {onPeerJoin(id), onMessage(msg)}, read through a ref so they can change between renders.
// Returns {status: {text, cls}, remote: MediaStream|null, send(msg, targetId?), connected}.
export function useCall(params, stream, handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [status, setStatus] = useState({text: 'Waiting', cls: ''})
  const [remote, setRemote] = useState(null)
  const api = useRef({send: () => {}, peerId: null})

  useEffect(() => {
    let room, retryTimer, watchdog, closed = false
    const state = api.current

    function connect() {
      room = joinRoom(config(params), params.get('r'), {
        onJoinError: d => {
          if (/password/i.test(d.error || '')) return setStatus({text: "Can't join: this link doesn't match the call", cls: 'warn'})
          reconnect()
        },
      })
      const action = room.makeAction('book')
      state.send = (msg, target) => action.send(msg, target ? {target} : undefined)
      action.onMessage = msg => handlersRef.current.onMessage?.(msg)
      room.onPeerJoin = id => {
        room.addStream(stream, {target: id})
        handlersRef.current.onPeerJoin?.(id)
        setStatus({text: 'Connecting…', cls: ''})
        clearTimeout(watchdog)
        watchdog = setTimeout(() => { if (!state.peerId) reconnect() }, 15000)
      }
      room.onPeerStream = async (s, id) => {
        clearTimeout(watchdog)
        state.peerId = id
        setRemote(s)
        for (let i = 0; i < 10 && state.peerId === id && !closed; i++) {
          const pc = room.getPeers()[id]
          const path = pc && await connectionPath(pc)
          if (path) return setStatus({text: `Connected (${path})`, cls: 'ok'})
          await new Promise(r => setTimeout(r, 1000))
        }
        if (state.peerId === id) setStatus({text: 'Connected', cls: 'ok'})
      }
      room.onPeerLeave = id => {
        if (id !== state.peerId) return
        state.peerId = null
        setRemote(null)
        setStatus({text: 'Waiting', cls: ''})
      }
    }

    function reconnect() {
      if (retryTimer || closed) return
      setStatus({text: 'Reconnecting…', cls: ''})
      try { room?.leave() } catch {}
      retryTimer = setTimeout(() => { retryTimer = null; if (!closed) connect() }, 2000 + Math.random() * 2000)
    }

    connect()
    return () => {
      closed = true
      clearTimeout(retryTimer)
      clearTimeout(watchdog)
      state.send = () => {}
      state.peerId = null
      try { room?.leave() } catch {}
    }
  }, [params.get('r'), params.get('k'), stream])

  return {
    status, remote,
    connected: !!remote,
    send: (msg, target) => api.current.send(msg, target),
  }
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
