// Look at a book from the start screen: it opens in a new tab (#view=<id>) in the reader's page view, with a PDF
// download. A collection's story opens the same way, and a #view= link works on its own (bookmarks).
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {browser, page, check, URL_, LK} from './lib.mjs'
const home = await page(1180, 820)
await home.goto(`${URL_}#lk=${LK}`)
await home.waitForSelector('#viewBtn'); await home.click('#viewBtn')
const [p] = await Promise.all([home.context().waitForEvent('page'), home.locator('#browseShelf button', {hasText: "Little Owl's Day"}).click()])
await p.waitForSelector('#viewer #pageText', {timeout: 20000})
check(p.url().includes('#view=little-owls-day'), `new tab: ${p.url().split('#')[1]}`)
check((await p.textContent('#viewer #bookTitle')).includes("Little Owl's Day"), 'it shows the book')
await p.click('#viewer #nextBtn')
check((await p.textContent('#viewer #pageText')).includes('Chikit'), 'pages turn')
const [download] = await Promise.all([p.waitForEvent('download', {timeout: 60000}), p.click('#downloadBtn')])
const file = await download.path()
const info = execFileSync('pdfinfo', [file]).toString()
check(/Pages:\s+18/.test(info) && fs.statSync(file).size > 100000, `PDF downloaded: ${download.suggestedFilename()}, ${info.match(/Pages:\s+\d+/)}`)

await home.locator('#browseShelf button', {hasText: 'Frog and Toad'}).click()
const [story] = await Promise.all([home.context().waitForEvent('page'), home.locator('#browseShelf .storyList button').first().click()])
await story.waitForSelector('#viewer #pageText', {timeout: 20000})
check((await story.textContent('#viewer #bookTitle')).startsWith('Frog and Toad:'), `a story opens in its own tab: ${await story.textContent('#viewer #bookTitle')}`)

const direct = await p.context().newPage()
await direct.goto(`${URL_}#view=little-owls-night`)
await direct.waitForSelector('#viewer #pageText', {timeout: 20000}).catch(() => {})
check((await direct.textContent('#viewer #bookTitle').catch(() => '')).includes("Little Owl's Night"), 'a #view= link opens directly (bookmark)')
await direct.click('#viewerClose'); await direct.waitForSelector('#startBtn')
check(true, '"All books" goes to the start screen')
await browser.close()
