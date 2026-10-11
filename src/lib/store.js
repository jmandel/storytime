// Small localStorage-backed stores shared between components. Every write notifies all users of that key, so
// changing the setup (e.g. picking another reader) re-renders in place.
import {useSyncExternalStore} from 'react'

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

export const SETUP = 'storytime-setup'          // {lk, child, relay, turn, lib, readers: [...], current}
export const LAST_CALLS = 'storytime-last-call' // {<reader name>: {child, reader, at}}
export const RECENT = 'storytime-recent'        // [book id, ...], most recent first

export function rememberBook(id) {
  update(RECENT, list => [id, ...(list || []).filter(r => r !== id)].slice(0, 8))
}

// The parent's phone remembers its setup, so after opening the home link once the bare site address is enough.
// A home link may list several readers: reader=Gramma,Grammie. Call links (r=...) are never saved.
export const SETUP_KEYS = ['lk', 'child', 'relay', 'turn', 'lib']
export function ingestHomeLink() {
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.get('r')) return
  const setup = read(SETUP)
  if (setup?.reader && !setup.readers) {  // older one-reader format
    update(SETUP, s => { s.readers = [s.reader]; s.current = s.reader; delete s.reader; return s })
  }
  if (![...SETUP_KEYS, 'reader'].some(k => params.has(k))) return
  const fresh = Object.fromEntries(SETUP_KEYS.filter(k => params.has(k)).map(k => [k, params.get(k)]))
  fresh.readers = (params.get('reader') || '').split(',').map(n => n.trim()).filter(Boolean)
  fresh.current = fresh.readers[0] || ''
  write(SETUP, fresh)
  history.replaceState(null, '', location.pathname)  // keep the key out of the address bar
}

// The settings a call link carries, from the saved setup and the chosen reader.
export function setupParams(setup) {
  const p = new URLSearchParams()
  for (const k of SETUP_KEYS) if (setup?.[k]) p.set(k, setup[k])
  if (setup?.current) p.set('reader', setup.current)
  return p
}

export function homeLinkParams(setup) {
  const p = new URLSearchParams()
  for (const k of SETUP_KEYS) if (setup?.[k]) p.set(k, setup[k])
  if (setup?.readers?.length) p.set('reader', setup.readers.join(','))
  return p
}
