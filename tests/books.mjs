// The shared book: anyone opens a book or turns a page and every screen follows; someone joining gets what is open.
// The tablet shows the page panel, the phone the slim bar (and can show the words too).
import {browser, check, member, joinCall, waitSeeing, testRoom} from './lib.mjs'
const room = testRoom()
const gramma = await member('Gramma', {room}), cleo = await member('Cleo', {room, width: 390, height: 844, mobile: true})
await joinCall(gramma); await joinCall(cleo)
check(await waitSeeing(gramma, 1) && await waitSeeing(cleo, 1), 'connected')
await gramma.waitForSelector('#shelf .cover')
const title = (await gramma.locator('#shelf .cover:not(:has(.sub)) .name').allTextContents())[0]
await gramma.locator('#shelf .cover', {hasText: title}).first().click()
await gramma.waitForSelector('#strip img', {timeout: 20000})
check(await gramma.textContent('#bookTitle') === title, `the tablet opens ${title}`)
const bar = () => cleo.textContent('#bookBar').catch(() => '')
check(await cleo.waitForFunction(t => document.getElementById('bookBar')?.textContent.includes(t), title, {timeout: 15000}).then(() => true, () => false),
  `the phone follows: ${await bar()}`)
await cleo.click('#barNext')
check(await gramma.waitForFunction(() => document.getElementById('pageNum')?.textContent !== 'Cover', null, {timeout: 10000}).then(() => true, () => false),
  `the phone turns the page: ${await gramma.textContent('#pageNum')}`)
await gramma.click('#nextBtn')
check(await cleo.waitForFunction(() => /Page 2/.test(document.getElementById('bookBar')?.textContent), null, {timeout: 10000}).then(() => true, () => false),
  `the tablet turns the page: ${await bar()}`)
await cleo.click('#pageBadge'); await cleo.waitForSelector('#pickerShelf')
const other = (await cleo.locator('#pickerShelf .cover:not(:has(.sub)) .name').allTextContents()).find(t => t !== title)
await cleo.locator('#pickerShelf .cover', {hasText: other}).first().click()
check(await gramma.waitForFunction(t => document.getElementById('bookTitle')?.textContent === t, other, {timeout: 15000}).then(() => true, () => false),
  `the phone switches the book to ${other}`)
await cleo.click('#bookToggle'); await cleo.waitForSelector('#book #pageText', {timeout: 15000}).catch(() => {})
check(await cleo.isVisible('#book #pageText'), 'the phone can show the words too')

const dad = await member('Dad', {room, width: 1440, height: 900}); await joinCall(dad)
check(await dad.waitForFunction(t => document.getElementById('bookTitle')?.textContent === t, other, {timeout: 45000}).then(() => true, () => false),
  'someone joining opens the book that is open')
await browser.close()
