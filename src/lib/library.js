// Books: public ones (books/public/index.json + <id>.json, readable by anyone) and private ones, encrypted files
// (12-byte IV + AES-GCM ciphertext of JSON) opened with the library key from the link (books/index.bin + <hash>.bin).
// The indexes list the books with small covers; a whole book is only fetched when it is opened.
import {useEffect, useState} from 'react'
import {fromB64url} from './links.js'

const keys = new Map()
const indexes = new Map()

export async function openSealed(lk, lib, file) {
  if (!keys.has(lk)) keys.set(lk, crypto.subtle.importKey('raw', fromB64url(lk), 'AES-GCM', false, ['decrypt']))
  const res = await fetch(libUrl(lib, file))
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.slice(0, 12)}, await keys.get(lk), buf.slice(12))
  return JSON.parse(new TextDecoder().decode(plain))
}

const libUrl = (lib, file) => new URL(file, new URL(lib || 'books/', location.href))

async function loadPublic(lib, file) {
  const res = await fetch(libUrl(lib, `public/${file}`))
  if (!res.ok) throw new Error(`public/${file}: ${res.status}`)
  return res.json()
}

// A whole book from its index entry.
export const openBook = (entry, lk, lib) => entry.public ? loadPublic(lib, entry.file) : openSealed(lk, lib, entry.file)

async function loadIndex(lk, lib) {
  const [pub, priv] = await Promise.all([
    loadPublic(lib, 'index.json').then(r => r.books, () => []),
    lk ? openSealed(lk, lib, 'index.bin').then(r => r.books) : [],
  ])
  const seen = new Set(pub.map(b => b.id))
  return [...pub, ...priv.filter(b => !seen.has(b.id))]
}

// The book list (public books plus, with a library key, the private ones): {books, error}; books is null while
// loading.
export function useLibrary(lk, lib) {
  const id = `${lk || ''}|${lib || ''}`
  const [state, setState] = useState({id, books: null, error: null})
  useEffect(() => {
    let live = true
    if (!indexes.has(id)) indexes.set(id, loadIndex(lk, lib))
    indexes.get(id).then(
      books => live && setState({id, books, error: null}),
      e => { indexes.delete(id); live && setState({id, books: [], error: e.message}) })
    return () => { live = false }
  }, [id])
  return state.id === id ? state : {books: null, error: null}
}

export const pageLabel = (book, i) => book.pages[i]?.label || `Page ${i}`

// Every openable entry by id: plain books, and each story of a collection as its own entry (id "<collection>/<story>",
// titled "Collection: Story", with the collection's cover and a link back to the collection).
export function entriesById(books) {
  const map = new Map()
  for (const b of books || []) {
    if (!b.collection) { map.set(b.id, b); continue }
    map.set(b.id, b)
    b.stories.forEach((s, i) => map.set(s.id, {...s, title: `${b.title}: ${s.title}`, storyTitle: s.title,
      cover: b.cover, author: b.author, tags: b.tags, parent: b, next: b.stories[i + 1]?.id}))
  }
  return map
}
