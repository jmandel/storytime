// Books added in the browser: kept on this device (IndexedDB), per family, and passed to the family's other devices
// during calls (src/lib/share.js). A book is {id, title, author, pages: [{img, thumb, text, label?}], cover, at, by};
// a removed one stays as {id, deleted: true, at} so the removal spreads too. The latest change (at) wins.
import {useEffect, useState} from 'react'
import {randomId} from './links.js'
import {roomOf} from './family.js'

const DB = 'storytime', STORE = 'books'
let dbPromise
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, {keyPath: 'key'})
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}
const tx = async (mode, fn) => {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
  })
}

// Books are filed under the family's room name (not its key).
const shelfOf = f => roomOf(f)
const listeners = new Set()
// Other tabs of this device hear about changes too (e.g. a book added in one tab while the call is open in another).
const tabs = typeof BroadcastChannel === 'function' ? new BroadcastChannel('storytime-books') : null
if (tabs) tabs.onmessage = () => listeners.forEach(fn => fn())
const changed = () => { listeners.forEach(fn => fn()); tabs?.postMessage('changed') }
// Called whenever a local book is added, changed or removed (e.g. to offer it to everyone in a call).
export function onLocalChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export async function localBooks(f, {withDeleted = false} = {}) {
  const shelf = await shelfOf(f)
  const all = await tx('readonly', s => s.getAll())
  return all.filter(b => b.shelf === shelf && (withDeleted || !b.deleted)).map(({key, shelf, ...b}) => b)
}
export async function getLocalBook(f, id) {
  const key = `${await shelfOf(f)}/${id}`
  const b = await tx('readonly', s => s.get(key))
  if (!b || b.deleted) return null
  const {key: _, shelf, ...book} = b
  return book
}
// Save a book (or a removal) if it is newer than the copy here; returns whether it was saved.
export async function putLocalBook(f, book) {
  const shelf = await shelfOf(f), key = `${shelf}/${book.id}`
  const have = await tx('readonly', s => s.get(key))
  if (have && have.at >= book.at) return false
  await tx('readwrite', s => s.put({...book, key, shelf}))
  changed()
  return true
}
export const removeLocalBook = (f, id) => putLocalBook(f, {id, deleted: true, at: Date.now()})
export const newBookId = () => `my-${randomId(6)}`

// The index entries for this family's local books (like the hosted index: id, title, author, cover, pages), live.
export function useLocalBooks(f) {
  const [books, setBooks] = useState([])
  useEffect(() => {
    if (!f) return setBooks([])
    let live = true
    const load = () => localBooks(f).then(list => live && setBooks(list.map(b => ({
      id: b.id, title: b.title, author: b.author || '', tags: ['added here'], cover: b.cover, pages: b.pages.length, local: true, at: b.at}))),
      () => live && setBooks([]))
    load()
    listeners.add(load)
    return () => { live = false; listeners.delete(load) }
  }, [f])
  return books
}

// A photo (File or Blob) as a JPEG data URL at most `max` px on its longer side, turned `turns` quarter turns.
export async function photoToJpeg(file, max = 1600, turns = 0, quality = 0.84) {
  const bmp = await createImageBitmap(file)
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * r), h = Math.round(bmp.height * r)
  const side = turns % 2 === 1
  const c = document.createElement('canvas')
  c.width = side ? h : w; c.height = side ? w : h
  const g = c.getContext('2d')
  g.translate(c.width / 2, c.height / 2)
  g.rotate(turns * Math.PI / 2)
  g.drawImage(bmp, -w / 2, -h / 2, w, h)
  return c.toDataURL('image/jpeg', quality)
}
// A data URL image turned and/or shrunk (for rotating a page and making thumbnails).
export async function reshape(dataUrl, {max = 1600, turns = 0, quality = 0.84} = {}) {
  const blob = await (await fetch(dataUrl)).blob()
  return photoToJpeg(blob, max, turns, quality)
}
