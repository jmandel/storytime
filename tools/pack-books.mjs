// Encrypt a folder of books for the site.
// usage: node tools/pack-books.mjs [books dir] [out dir]   (defaults: $STORYTIME_BOOKS and books/)
// Each <books dir>/<book>/book.json has {id, title, author, tags?, voices?, public?, pages: [{img, text, label?, note?}]}; images sit
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

// Books marked "public": true (our own, e.g. ones drawn with Codex) are written unencrypted to <out>/public/
// (index.json + <id>.json) so anyone can read them without a key; all others are sealed with the library key.
// A folder with collection.json is a collection (e.g. a Frog and Toad compendium scanned one story at a time): each
// subfolder with a book.json is one story, packed as its own file; the collection is one entry in the book list,
// with its stories (in printed-page order) as contents.
// Files from earlier runs that no book produces any more are removed.
const pub = path.join(out, 'public')
fs.mkdirSync(pub, {recursive: true})
const index = [], publicIndex = [], written = new Set()
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const firstNumber = book => Number(book.pages.map(p => p.label?.match(/\d+/)?.[0]).find(Boolean) ?? Infinity)

// Write one book (or story) file; returns its file name.
async function writeBook(book, dir, isPublic) {
  const pages = book.pages.map(p => ({...p, img: dataUrl(path.join(dir, p.img)), thumb: thumb(path.join(dir, p.img))}))
  const data = {...book, pages}
  if (isPublic) {
    const name = `${book.id.replace(/\//g, '--')}.json`
    fs.writeFileSync(path.join(pub, name), JSON.stringify(data))
    written.add(path.join(pub, name))
    return name
  }
  // File names don't reveal titles: HMAC of the book id under the library key.
  const name = b64url(await subtle.sign('HMAC', hmacKey, new TextEncoder().encode(book.id))).slice(0, 16) + '.bin'
  fs.writeFileSync(path.join(out, name), await seal(data))
  written.add(path.join(out, name))
  return name
}

for (const dir of fs.readdirSync(src).sort()) {
  const folder = path.join(src, dir)
  if (fs.existsSync(path.join(folder, 'collection.json'))) {
    const col = readJson(path.join(folder, 'collection.json'))
    const stories = fs.readdirSync(folder)
      .filter(d => fs.existsSync(path.join(folder, d, 'book.json')))
      .map(d => ({dir: path.join(folder, d), book: readJson(path.join(folder, d, 'book.json'))}))
      .sort((a, b) => (a.book.start ?? firstNumber(a.book)) - (b.book.start ?? firstNumber(b.book)))
    const contents = []
    for (const {dir: storyDir, book} of stories) {
      const id = `${col.id}/${book.id}`
      const file = await writeBook({...book, id, author: book.author || col.author, voices: {...col.voices, ...book.voices},
        collection: {id: col.id, title: col.title}}, storyDir, col.public)
      contents.push({id, title: book.title, file, pages: book.pages.length,
        first: book.pages[0]?.label, last: book.pages.at(-1)?.label, ...(col.public ? {public: true} : {})})
      console.log(`${col.title} / ${book.title}: ${book.pages.length} pages -> ${col.public ? 'public/' : ''}${file}`)
    }
    const coverFile = fs.existsSync(path.join(folder, 'cover.jpg')) ? path.join(folder, 'cover.jpg')
      : path.join(stories[0].dir, stories[0].book.pages[0].img)
    const entry = {id: col.id, title: col.title, author: col.author, tags: col.tags || [], cover: thumb(coverFile, 240),
      collection: true, stories: contents, pages: contents.reduce((n, s) => n + s.pages, 0)}
    ;(col.public ? publicIndex : index).push(entry)
    continue
  }
  const bookFile = path.join(folder, 'book.json')
  if (!fs.existsSync(bookFile)) continue
  const book = readJson(bookFile)
  const file = await writeBook(book, folder, book.public)
  const entry = {id: book.id, title: book.title, author: book.author, tags: book.tags || [],
    cover: thumb(path.join(folder, book.pages[0].img), 240), pages: book.pages.length, file}
  if (book.public) publicIndex.push({...entry, public: true}); else index.push(entry)
  console.log(`${book.title}: ${book.pages.length} pages -> ${book.public ? 'public/' : ''}${file}`)
}
fs.writeFileSync(path.join(out, 'index.bin'), await seal({books: index}))
fs.writeFileSync(path.join(pub, 'index.json'), JSON.stringify({books: publicIndex}))
for (const [dir, ext] of [[out, '.bin'], [pub, '.json']])
  for (const f of fs.readdirSync(dir))
    if (f.endsWith(ext) && !['index.bin', 'index.json'].includes(f) && !written.has(path.join(dir, f))) {
      fs.rmSync(path.join(dir, f))
      console.log(`removed stale ${path.relative(out, path.join(dir, f))}`)
    }
console.log(`index.bin: ${index.length} private entries; public/index.json: ${publicIndex.length} public entries`)
