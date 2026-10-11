// Books: encrypted files (12-byte IV + AES-GCM ciphertext of JSON) opened with the library key from the link.
// index.bin lists the books with small covers; a whole book is only fetched when it is opened.
import {useEffect, useState} from 'react'
import {fromB64url} from './links.js'

const keys = new Map()
const indexes = new Map()

export async function openSealed(lk, lib, file) {
  if (!keys.has(lk)) keys.set(lk, crypto.subtle.importKey('raw', fromB64url(lk), 'AES-GCM', false, ['decrypt']))
  const res = await fetch(new URL(file, new URL(lib || 'books/', location.href)))
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.slice(0, 12)}, await keys.get(lk), buf.slice(12))
  return JSON.parse(new TextDecoder().decode(plain))
}

// The book list for a library key: {books, error}; books is null while loading.
export function useLibrary(lk, lib) {
  const id = `${lk}|${lib || ''}`
  const [state, setState] = useState({id, books: null, error: null})
  useEffect(() => {
    if (!lk) return setState({id, books: [], error: null})
    let live = true
    if (!indexes.has(id)) indexes.set(id, openSealed(lk, lib, 'index.bin').then(r => r.books))
    indexes.get(id).then(
      books => live && setState({id, books, error: null}),
      e => { indexes.delete(id); live && setState({id, books: [], error: e.message}) })
    return () => { live = false }
  }, [id])
  return state.id === id ? state : {books: null, error: null}
}

export const pageLabel = (book, i) => book.pages[i]?.label || `Page ${i}`
