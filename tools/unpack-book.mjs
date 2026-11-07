// Turn a book exported from the app ("Export" on a book added in the browser) into a book folder.
// usage: node tools/unpack-book.mjs <file.storytime.json> [books dir]   (default: $STORYTIME_BOOKS)
// Writes <books dir>/<id>/book.json and page-NN.jpg. Then fix the pages and words as for a scan, and npm run pack.
import fs from 'node:fs'
import path from 'node:path'
import './env.mjs'

const [file, dir = process.env.STORYTIME_BOOKS] = process.argv.slice(2)
if (!file || !dir) { console.error('usage: node tools/unpack-book.mjs <file.storytime.json> [books dir]'); process.exit(1) }
const book = JSON.parse(fs.readFileSync(file, 'utf8'))
const id = book.id.replace(/^my-/, '').replace(/[^\w-]/g, '') || 'book'
const out = path.join(dir, book.title ? book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || id : id)
fs.mkdirSync(out, {recursive: true})
const pages = book.pages.map((p, i) => {
  const name = `page-${String(i).padStart(2, '0')}.jpg`
  fs.writeFileSync(path.join(out, name), Buffer.from(p.img.split(',')[1], 'base64'))
  return {img: name, ...(i === 0 ? {label: 'Cover'} : {}), ...(p.label ? {label: p.label} : {}), text: p.text || ''}
})
const json = {id: path.basename(out), title: book.title, author: book.author || '', pages}
fs.writeFileSync(path.join(out, 'book.json'), JSON.stringify(json, null, 1))
console.log(`${book.title}: ${pages.length} pages -> ${out}`)
