// Small localStorage-backed stores shared between components. Every write notifies all users of that key, so a
// change (e.g. the family's name) re-renders in place.
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

export const RECENT = 'storytime-recent'  // [book id, ...], most recent first

export function rememberBook(id) {
  update(RECENT, list => [id, ...(list || []).filter(r => r !== id)].slice(0, 8))
}
