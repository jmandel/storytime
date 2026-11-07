// Addresses (everything lives after '#', so it never reaches the web server):
//   #f=<family key>&n=<family name>   the family link (src/lib/family.js); saved on the device, then cleared
//        optional: &lib=<url of a books/ folder>, &relay=wss://a,wss://b, &turn=<base64url JSON iceServers>
//   (empty)                           home (or the welcome screen on a device without a family)
//   #call                             the family call (&preview=1: join straight away, incoming audio muted)
//   #view=<book id>                   one book on its own, with a PDF download
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
