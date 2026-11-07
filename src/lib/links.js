// Link format (everything lives after '#', so it never reaches the web server):
//   #r=<room>&k=<secret>&lk=<library key>&reader=<name>&child=<name>   a reader's call: one link for both sides,
//       the same every time. Each device works out its side (store.js callSide): the parent's device has the call
//       saved, so it is the child's phone; any other device is the reader.
//   optional: &as=reader|child (force a side: preview.html, tests, "Open <child>'s side")
//             &b=<id>,<id>,... (on the phone's own address only: tonight's stack, sent to the tablet over the call)
//             &lib=<url of the encrypted books folder> (default: books/ next to this page)
//             &relay=wss://a,wss://b (our own signaling relays instead of the defaults)
//             &turn=<base64url JSON iceServers> (TURN servers for networks that block direct calls)
//             &preview=1 (join straight away with incoming audio muted; used by preview.html)
import {useEffect, useState} from 'react'
import {markOwnNavigation} from './guard.js'

export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export const randomId = n => b64url(crypto.getRandomValues(new Uint8Array(n)))

export const pageUrl = () => `${location.origin}${location.pathname}`
export const linkWith = params => `${pageUrl()}#${params}`

// The hash as URLSearchParams, re-rendering when it changes. Navigation between screens is a hash change, not a reload.
export function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const update = () => setHash(location.hash)
    addEventListener('hashchange', update)
    return () => removeEventListener('hashchange', update)
  }, [])
  return new URLSearchParams(hash.slice(1))
}

const changes = params => `#${params ? params.toString() : ''}` !== (location.hash || '#')
export const go = params => {
  if (!changes(params)) return
  markOwnNavigation()
  location.hash = params ? params.toString() : ''
}
// Same, replacing the current history entry (so Back doesn't return to it, e.g. a call that was left).
export const goReplace = params => {
  if (!changes(params)) return
  markOwnNavigation()
  location.replace(`${location.pathname}${location.search}#${params ? params.toString() : ''}`)
}

export function shareLink(url, title = 'Storytime') {
  if (navigator.share) return navigator.share({title, url}).catch(() => {})
  return navigator.clipboard.writeText(url).then(() => alert('Link copied'))
}
