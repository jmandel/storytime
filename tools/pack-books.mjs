// Encrypt a folder of books for the site.
// usage: node tools/pack-books.mjs [books dir] [out dir]   (defaults: $STORYTIME_BOOKS and books/)
// Each <books dir>/<book>/book.json has {id, title, author, tags?, voices?, pages: [{img, text, label?, note?}]}; images sit
// beside it. Page text can mark speakers inline: [Frog: "Toad, Toad,"] shouted Frog. voices maps a speaker to a color.
// The library key comes from STORYTIME_LIBRARY_KEY in the repo's .env (created there on first run if empty).
// Output: <out dir>/index.bin (book list with small covers) and one <hash>.bin per book, all AES-GCM encrypted.
// The app reads them with the key from the link (#lk=...), so the files are safe to publish.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const {subtle} = globalThis.crypto

const envFile = new URL('../.env', import.meta.url).pathname
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
const src = process.argv[2] || process.env.STORYTIME_BOOKS
const out = process.argv[3] || new URL('../books', import.meta.url).pathname
if (!src) { console.error('usage: node tools/pack-books.mjs [books dir] [out dir]  (or set STORYTIME_BOOKS in .env)'); process.exit(1) }
const b64url = buf => Buffer.from(buf).toString('base64url')
let keyText = process.env.STORYTIME_LIBRARY_KEY
if (!keyText) {
  keyText = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
  fs.writeFileSync(envFile, /^STORYTIME_LIBRARY_KEY=.*$/m.test(env)
    ? env.replace(/^STORYTIME_LIBRARY_KEY=.*$/m, `STORYTIME_LIBRARY_KEY=${keyText}`)
    : `${env}STORYTIME_LIBRARY_KEY=${keyText}\n`, {mode: 0o600})
  console.log(`new library key written to ${envFile}`)
}
const rawKey = Buffer.from(keyText.trim(), 'base64url')
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
