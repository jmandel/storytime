// Look at a book from the start screen and download it as a PDF.
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {browser, page, check, URL_, LK} from './lib.mjs'
const p = await page(1180, 820)
await p.goto(`${URL_}#lk=${LK}`)
await p.waitForSelector('#viewBtn'); await p.click('#viewBtn')
await p.locator('#browseShelf button', {hasText: "Little Owl's Day"}).click()
await p.waitForSelector('#viewer #pageText')
check((await p.textContent('#viewer #bookTitle')).includes("Little Owl"), 'viewer opens the book')
await p.click('#viewer #nextBtn')
check((await p.textContent('#viewer #pageText')).includes('Chikit'), 'viewer turns pages')
const [download] = await Promise.all([p.waitForEvent('download', {timeout: 60000}), p.click('#downloadBtn')])
const file = await download.path()
const info = execFileSync('pdfinfo', [file]).toString()
check(/Pages:\s+18/.test(info) && fs.statSync(file).size > 100000, `PDF downloaded: ${download.suggestedFilename()}, ${info.match(/Pages:\s+\d+/)}`)
await p.click('#viewerClose')
check(!(await p.isVisible('#viewer')), 'viewer closes')
await browser.close()
