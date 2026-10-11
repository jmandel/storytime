// Encrypt a folder of books for the site.
// usage: node tools/pack-books.mjs <books dir> <out dir>
// Each <books dir>/<book>/book.json has {id, title, author, tags?, pages: [{img, text, label?, note?}]}; images sit beside it.
// The library key (32 random bytes, base64url) lives in <books dir>/.library-key and is created on first run.
// Output: <out dir>/index.bin (book list with small covers) and one <hash>.bin per book, all AES-GCM encrypted.
// The app reads them with the key from the link (#lk=...), so the files are safe to publish.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const {subtle} = globalThis.crypto

const [src, out] = process.argv.slice(2)
if (!src || !out) { console.error('usage: node tools/pack-books.mjs <books dir> <out dir>'); process.exit(1) }
const b64url = buf => Buffer.from(buf).toString('base64url')
const keyFile = path.join(src, '.library-key')
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, b64url(crypto.getRandomValues(new Uint8Array(32))) + '\n', {mode: 0o600})
const rawKey = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64url')
const key = await subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
const hmacKey = await subtle.importKey('raw', rawKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])

async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(JSON.stringify(obj)))
  return Buffer.concat([iv, Buffer.from(ct)])
}
const dataUrl = file => `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`
const thumb = (file, size = 320) => `data:image/jpeg;base64,${execFileSync('magick', [file, '-resize', `${size}x${size}>`, '-strip', '-quality', '70', 'jpg:-']).toString('base64')}`

fs.mkdirSync(out, {recursive: true})
const index = []
for (const dir of fs.readdirSync(src).sort()) {
  const bookFile = path.join(src, dir, 'book.json')
  if (!fs.existsSync(bookFile)) continue
  const book = JSON.parse(fs.readFileSync(bookFile, 'utf8'))
  const pages = book.pages.map(p => ({...p, img: dataUrl(path.join(src, dir, p.img)), thumb: thumb(path.join(src, dir, p.img))}))
  // File names don't reveal titles: HMAC of the book id under the library key.
  const name = b64url(await subtle.sign('HMAC', hmacKey, new TextEncoder().encode(book.id))).slice(0, 16) + '.bin'
  fs.writeFileSync(path.join(out, name), await seal({...book, pages}))
  index.push({id: book.id, file: name, title: book.title, author: book.author, tags: book.tags || [],
    cover: thumb(path.join(src, dir, book.pages[0].img), 240), pages: pages.length})
  console.log(`${book.title}: ${pages.length} pages -> ${name}`)
}
fs.writeFileSync(path.join(out, 'index.bin'), await seal({books: index}))
console.log(`index.bin: ${index.length} books`)
