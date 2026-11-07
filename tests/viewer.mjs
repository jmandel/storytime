// Looking at a book without a call: from the home shelf it opens in the page view (#view=<id>), with a PDF download;
// a story opens the same way, and a #view= address works on its own (bookmarks).
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import {browser, check, member, URL_} from './lib.mjs'
const p = await member('Dad')
await p.locator('#homeShelf .cover', {hasText: "Little Owl's Day"}).click()
await p.waitForSelector('#viewer #pageText', {timeout: 20000})
check(p.url().includes('#view=little-owls-day') && (await p.textContent('#viewer #bookTitle')).includes("Little Owl's Day"), 'a book opens in the page view')
await p.click('#viewer #nextBtn')
check((await p.textContent('#viewer #pageText')).includes('Chikit'), 'pages turn')
const [download] = await Promise.all([p.waitForEvent('download', {timeout: 60000}), p.click('#downloadBtn')])
const info = execFileSync('pdfinfo', [await download.path()]).toString()
check(/Pages:\s+18/.test(info) && fs.statSync(await download.path()).size > 100000, `PDF downloaded: ${download.suggestedFilename()}, ${info.match(/Pages:\s+\d+/)}`)
await p.click('#viewerClose'); await p.waitForSelector('#joinCallBtn')
check(true, 'closing goes back home')
await p.locator('#homeShelf .cover', {hasText: 'Frog and Toad'}).click()
await p.locator('#homeShelf .storyList button').first().click()
await p.waitForSelector('#viewer #pageText', {timeout: 20000})
check((await p.textContent('#viewer #bookTitle')).startsWith('Frog and Toad:'), `a story opens: ${await p.textContent('#viewer #bookTitle')}`)
const direct = await p.context().newPage()
await direct.goto(`${URL_}#view=little-owls-night`)
await direct.waitForSelector('#viewer #pageText', {timeout: 20000}).catch(() => {})
check((await direct.textContent('#viewer #bookTitle').catch(() => '')).includes("Little Owl's Night"), 'a #view= address opens directly (bookmark)')
await browser.close()
