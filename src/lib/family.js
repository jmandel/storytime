// A family: one key, shared by everyone in it through the family link (#f=<key>&n=<family name>). The call's room
// and secret and the hosted library's key are all derived from it (HKDF-SHA256), so the link is all a device needs.
// tools/pack-books.mjs derives the library key the same way.
import {b64url, fromB64url, randomId} from './links.js'
import {read, update, write} from './store.js'

export const FAMILY = 'storytime-family'  // {f, name, lib?, relay?, turn?, people: [names seen in calls]}
export const ME = 'storytime-me'          // {name, device}
const LINK_KEYS = ['lib', 'relay', 'turn', 'room']  // room: a separate call for the same family (tests)

const derived = new Map()
export function derive(f, info, bytes) {
  const id = `${f}|${info}|${bytes}`
  if (!derived.has(id)) derived.set(id, (async () => {
    const base = await crypto.subtle.importKey('raw', fromB64url(f), 'HKDF', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      {name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info)}, base, bytes * 8)
    return b64url(new Uint8Array(bits))
  })())
  return derived.get(id)
}
export const roomOf = (f, room) => derive(f, 'storytime room', 12).then(r => room ? `${r}-${room}` : r)
export const secretOf = f => derive(f, 'storytime call', 18)
export const libraryKeyOf = f => derive(f, 'storytime library', 32)

export const newFamilyKey = () => randomId(32)

export function familyLink(family) {
  const p = new URLSearchParams({f: family.f})
  if (family.name) p.set('n', family.name)
  for (const k of LINK_KEYS) if (family[k]) p.set(k, family[k])
  return `${location.origin}${location.pathname}#${p}`
}

// A family link opened on this device: save the family (asking first if it replaces another one), then keep the key
// out of the address bar. #call (also in the same link, for tests and preview.html) goes on to the call, and
// name= sets who is using this device.
export function ingestFamilyLink() {
  const params = new URLSearchParams(location.hash.slice(1))
  const f = params.get('f')
  if (!f || params.get('preview') === '1') return  // preview.html's frames keep theirs in the address
  const have = read(FAMILY)
  if (have?.f !== f && have?.f && !confirm(`Switch this device to ${params.get('n') || 'this family'}?`)) {
    history.replaceState(null, '', location.pathname)
    return
  }
  const family = {f, name: params.get('n') || '', people: have?.f === f ? have.people || [] : []}
  for (const k of LINK_KEYS) if (params.get(k)) family[k] = params.get(k)
  write(FAMILY, family)
  if (params.get('name')) setMyName(params.get('name'))
  const rest = [params.has('call') && 'call', params.has('preview') && 'preview=1'].filter(Boolean).join('&')
  history.replaceState(history.state, '', `${location.pathname}${rest ? `#${rest}` : ''}`)
}

export function startFamily(name, myName) {
  write(FAMILY, {f: newFamilyKey(), name: name.trim(), people: []})
  setMyName(myName)
}

export function me() {
  let m = read(ME)
  if (!m?.device) { m = {name: m?.name || '', device: randomId(9)}; write(ME, m) }
  return m
}
export const setMyName = name => update(ME, m => ({device: m?.device || randomId(9), name: name.trim()}))

// Names seen in calls, offered when a new device asks "Who's this?".
export function rememberPerson(name) {
  if (!name) return
  const fam = read(FAMILY)
  if (fam && !(fam.people || []).includes(name)) update(FAMILY, f => ({...f, people: [...(f.people || []), name].slice(-12)}))
}

export const leaveFamily = () => write(FAMILY, null)
