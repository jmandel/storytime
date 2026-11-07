// A book added in the browser: photos put in order and turned, words typed, saved on the device; it reaches the
// family's other devices during a call, and so do changes to it and its removal. Export makes a book folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {browser, check, member, joinCall, waitSeeing, fresh} from './lib.mjs'
const photo = (label, size) => ({name: `${label}.jpg`, mimeType: 'image/jpeg',
  buffer: execFileSync('magick', ['-size', size, `xc:#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`, '-gravity', 'center',
    '-pointsize', '60', '-annotate', '0', label, 'jpg:-'])})
const f = fresh()
const dad = await member('Dad', {f, width: 1180, height: 820})
dad.on('dialog', d => d.accept())
await dad.click('#addBookBtn'); await dad.waitForSelector('#addBook')
await dad.setInputFiles('#photos', [photo('Cover', '600x800'), photo('Two', '1200x600'), photo('One', '600x1200')])
await dad.waitForFunction(() => document.querySelectorAll('#pages li').length === 3)
await dad.locator('#pages li').nth(2).getByRole('button', {name: 'Turn'}).click()
await dad.waitForTimeout(500)
const turned = await dad.locator('#pages li').nth(2).locator('img').evaluate(i => i.naturalWidth > i.naturalHeight)
check(turned, 'a sideways photo can be turned')
await dad.locator('#pages li').nth(2).getByRole('button', {name: /earlier/}).click()
await dad.locator('#pages li').nth(1).locator('textarea').fill('One little duck')
await dad.fill('#bookTitleInput', 'Our Duck Book'); await dad.fill('#bookAuthorInput', 'Dad')
await dad.click('#saveBookBtn'); await dad.waitForSelector('#viewer #pageText')
check(await dad.textContent('#viewer #bookTitle') === 'Our Duck Book', 'saving opens the book')
await dad.click('#viewer #nextBtn')
check((await dad.textContent('#viewer #pageText')).includes('One little duck'), 'the pages are in the new order, with the words')

const [download] = await Promise.all([dad.waitForEvent('download'), dad.click('#exportBtn')])
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storytime-export-'))
execFileSync('node', [new URL('../tools/unpack-book.mjs', import.meta.url).pathname, await download.path(), dir])
const folder = path.join(dir, 'our-duck-book')
const json = JSON.parse(fs.readFileSync(path.join(folder, 'book.json'), 'utf8'))
check(json.pages.length === 3 && json.pages[1].text === 'One little duck' && fs.existsSync(path.join(folder, 'page-02.jpg')),
  'Export makes a book folder (book.json and page images)')
fs.rmSync(dir, {recursive: true})

await dad.click('#viewerClose'); await dad.waitForSelector('#homeShelf .cover')
check(await dad.locator('#homeShelf .cover', {hasText: 'Our Duck Book'}).count() === 1, 'it is on the shelf')

const gramma = await member('Gramma', {f})
check(await gramma.locator('#homeShelf .cover', {hasText: 'Our Duck Book'}).count() === 0, "another device doesn't have it yet")
await joinCall(dad); await joinCall(gramma)
await waitSeeing(gramma, 1)
const arrives = (p, t) => p.waitForFunction(t => [...document.querySelectorAll('#shelf .cover .name')].some(n => n.textContent === t), t, {timeout: 30000}).then(() => true, () => false)
check(await arrives(gramma, 'Our Duck Book'), 'it reaches the other device during the call')
await gramma.locator('#shelf .cover', {hasText: 'Our Duck Book'}).click()
await gramma.waitForSelector('#strip img'); await gramma.click('#nextBtn')
check((await gramma.textContent('#pageText')).includes('One little duck'), 'and opens there with its words')

// Changed while in the call (in another tab of Dad's device, so the call stays up).
const edit = await dad.context().newPage()
await edit.goto(dad.url().split('#')[0]); await edit.waitForSelector('#homeShelf .cover', {timeout: 20000})
await edit.locator('#homeShelf .cover', {hasText: 'Our Duck Book'}).click(); await edit.click('#changeBtn')
await edit.waitForFunction(() => document.getElementById('bookTitleInput')?.value === 'Our Duck Book')
await edit.fill('#bookTitleInput', 'The Duck Book'); await edit.click('#saveBookBtn'); await edit.waitForSelector('#viewer')
check(await gramma.waitForFunction(() => document.getElementById('bookTitle')?.textContent.includes('The Duck Book') ||
  [...document.querySelectorAll('.cover .name')].some(n => n.textContent === 'The Duck Book'), null, {timeout: 30000}).then(() => true, () => false),
  'a change reaches the other device')
edit.on('dialog', d => d.accept())
await edit.click('#removeBtn'); await edit.waitForSelector('#joinCallBtn')
await gramma.click('#shelfBtn').catch(() => {})
check(await gramma.waitForFunction(() => ![...document.querySelectorAll('#shelf .cover .name')].some(n => n.textContent === 'The Duck Book'), null, {timeout: 30000}).then(() => true, () => false),
  'removing it removes it from the other device')
await browser.close()
