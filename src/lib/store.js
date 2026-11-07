// Small localStorage-backed stores shared between components. Every write notifies all users of that key, so
// changing the setup (e.g. picking another reader) re-renders in place.
import {useSyncExternalStore} from 'react'
import {b64url, fromB64url, randomId} from './links.js'

const listeners = new Map()
const cache = new Map()

export function read(key) {
  let raw = null
  try { raw = localStorage.getItem(key) } catch {}
  if (!cache.has(key) || cache.get(key).raw !== raw) {
    let value = null
    try { value = JSON.parse(raw) } catch {}
    cache.set(key, {raw, value})
  }
  return cache.get(key).value
}

export function write(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)) } catch {}
  for (const fn of listeners.get(key) || []) fn()
}

export const update = (key, change) => write(key, change(structuredClone(read(key))))

export function useStored(key) {
  return useSyncExternalStore(fn => {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(fn)
    return () => listeners.get(key).delete(fn)
  }, () => read(key))
}

export const SETUP = 'storytime-setup'          // {lk, child, relay, turn, lib, readers: [...], current, calls: {<reader>: {r, k}}}
export const RECENT = 'storytime-recent'        // [book id, ...], most recent first
export const MY_CALL = 'storytime-my-call'      // the reader's tablet: the call link it was opened with

export function rememberBook(id) {
  update(RECENT, list => [id, ...(list || []).filter(r => r !== id)].slice(0, 8))
}

// The parent's phone remembers its setup, so after opening the home link once the bare site address is enough.
// A home link may list several readers: reader=Gramma,Grammie, and carries each reader's call (calls=, base64url JSON)
// so every parent device calls the same room. Call links (r=...) are never saved.
export const SETUP_KEYS = ['lk', 'child', 'relay', 'turn', 'lib']
const encodeCalls = calls => b64url(new TextEncoder().encode(JSON.stringify(calls)))
const decodeCalls = s => { try { return JSON.parse(new TextDecoder().decode(fromB64url(s))) } catch { return {} } }

export function ingestHomeLink() {
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.get('r')) return
  const setup = read(SETUP)
  if (setup?.reader && !setup.readers) {  // older one-reader format
    update(SETUP, s => { s.readers = [s.reader]; s.current = s.reader; delete s.reader; return s })
  }
  if (![...SETUP_KEYS, 'reader', 'calls'].some(k => params.has(k))) return
  const fresh = Object.fromEntries(SETUP_KEYS.filter(k => params.has(k)).map(k => [k, params.get(k)]))
  fresh.readers = (params.get('reader') || '').split(',').map(n => n.trim()).filter(Boolean)
  fresh.current = fresh.readers[0] || ''
  if (params.get('calls')) fresh.calls = decodeCalls(params.get('calls'))
  write(SETUP, fresh)
  history.replaceState(null, '', location.pathname)  // keep the key out of the address bar
}

// Each reader has one call for good: the same room and secret every time, so the reader's link can be sent ahead
// ("open this at 10 tomorrow") or bookmarked. Made the first time it's needed; newCall() replaces it (old links stop
// working).
export function callFor(reader) {
  const have = read(SETUP)?.calls?.[reader]
  if (have) return have
  const made = {r: randomId(12), k: randomId(18)}
  update(SETUP, s => ({...s, calls: {...s?.calls, [reader]: made}}))
  return made
}
export const newCall = reader => update(SETUP, s => { if (s?.calls) delete s.calls[reader]; return s })

// The one link for a reader's call. It names no side: each device works out its own (callSide).
export function callLink(setup, reader) {
  const p = new URLSearchParams()
  for (const k of SETUP_KEYS) if (setup?.[k]) p.set(k, setup[k])
  if (reader) p.set('reader', reader)
  const {r, k} = callFor(reader)
  p.set('r', r); p.set('k', k)
  return p
}

// Which side this device is on in the call in the link. The link names none: a device that has this call in its
// setup is the child's phone (the parent's device); any other is the reader. An explicit as= wins (preview.html,
// tests, and the "Open <child>'s side" / "I'm <reader>" buttons when a device guessed wrong).
export function callSide(params) {
  const as = params.get('as')
  if (as === 'reader' || as === 'child') return as
  const ours = Object.values(read(SETUP)?.calls || {}).some(c => c.r === params.get('r') && c.k === params.get('k'))
  return ours ? 'child' : 'reader'
}

export function homeLinkParams(setup) {
  const p = new URLSearchParams()
  for (const k of SETUP_KEYS) if (setup?.[k]) p.set(k, setup[k])
  if (setup?.readers?.length) p.set('reader', setup.readers.join(','))
  if (setup?.calls && Object.keys(setup.calls).length) p.set('calls', encodeCalls(setup.calls))
  return p
}
