// Link format (everything lives after '#', so it never reaches the web server):
//   #r=<room>&k=<secret>&as=reader|child&lk=<library key>
//   optional: &reader=<name>&child=<name> (shown in the app, e.g. reader=Grandma&child=Cleo)
//             &b=<id>,<id>,... (tonight's stack: shown first; the reader's tablet opens the first one)
//             &lib=<url of the encrypted books folder> (default: books/ next to this page)
//             &relay=wss://a,wss://b (our own signaling relays instead of the defaults)
//             &turn=<base64url JSON iceServers> (TURN servers for networks that block direct calls)
//             &preview=1 (join straight away with incoming audio muted; used by preview.html)
import {useEffect, useState} from 'react'

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

export const go = params => { location.hash = params ? params.toString() : '' }

export function shareLink(url, title = 'Storytime') {
  if (navigator.share) return navigator.share({title, url}).catch(() => {})
  return navigator.clipboard.writeText(url).then(() => alert('Link copied'))
}
