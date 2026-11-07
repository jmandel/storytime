// One link for both sides, the same every time: the reader can open it before the phone calls (sent ahead or
// bookmarked); the parent leaving with Back and calling again finds the reader still there; tonight's books go
// from the phone to the tablet over the call.
import fs from 'node:fs'
import {browser, page, check, URL_, LK} from './lib.mjs'
const phone = await page(390, 844, true)
phone.on('dialog', d => d.accept())
await phone.goto(`${URL_}#lk=${LK}&reader=Grandma&child=Cleo`)
await phone.waitForSelector('#startShelf button')
await phone.evaluate(() => {
  Object.defineProperty(navigator, 'share', {value: undefined})
  navigator.clipboard.writeText = async t => { window.copied = t }
  window.alert = () => {}
})
await phone.click('#sendLinkBtn'); await phone.waitForFunction(() => window.copied)
const link = await phone.evaluate(() => window.copied)
check(!new URLSearchParams(link.split('#')[1]).has('as'), 'the start screen sends the one link, before any call')

// Grandma opens it first, from a bookmark.
const tablet = await page(1180, 820)
await tablet.goto(link); await tablet.click('#joinBtn'); await tablet.waitForSelector('#waiting')
check(await tablet.evaluate(() => window.__storytimeCall?.me.role) === 'reader', 'a device without this call saved is the reader')

const title = (await phone.locator('#startShelf .mini-shelf').last().locator('button:not(:has(.storyCount))').allTextContents())[0]
await phone.locator('#startShelf button', {hasText: title}).last().click()
await phone.click('#startBtn'); await phone.waitForSelector('#leaveBtn')
check(await phone.evaluate(() => window.__storytimeCall?.me.role) === 'child', 'the phone that has the call saved is the child side')
const video = (p, t = 60000) => p.waitForFunction(() => document.getElementById('remote')?.videoWidth > 0 && !document.getElementById('waiting'), null, {timeout: t}).then(() => true, () => false)
check(await video(phone) && await video(tablet), 'they connect (reader there first)')
const opened = await tablet.waitForFunction(t => document.getElementById('bookTitle')?.textContent === t, title, {timeout: 20000}).then(() => true, () => false)
check(opened, `the tablet opens tonight's book from the phone (${title})`)

// The parent presses Back by mistake, then calls again.
await phone.goBack(); await phone.waitForSelector('#startBtn')
await phone.click('#startBtn'); await phone.waitForSelector('#leaveBtn')
const t0 = Date.now()
check(await video(phone, 90000) && await video(tablet, 90000), `calling again after Back reconnects to the same call (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
check(await tablet.textContent('#bookTitle') === title, 'the tablet keeps the open book')
check(await tablet.title() === 'Storytime with Cleo', `the tablet's title (the home-screen icon's name): ${await tablet.title()}`)

// Grandma leaves, then opens the bare address (a home-screen icon without the link).
await tablet.click('#leaveBtn')
check(await tablet.waitForSelector('#joinBtn', {timeout: 5000}).then(() => true, () => false), "leaving on the tablet comes back to its Join screen")
await tablet.goto(URL_); await tablet.waitForSelector('#joinBtn, #startBtn')
check(await tablet.isVisible('#joinBtn') && new URLSearchParams((await tablet.evaluate(() => location.hash)).slice(1)).get('r') === new URLSearchParams(link.split('#')[1]).get('r'),
  "the bare address on the tablet opens its call")

// A new version is published while the tablet waits on the Join screen: coming back to the front reloads it.
await tablet.evaluate(() => { window.oldPage = true })
await tablet.waitForTimeout(1500)
const now = new Date(); fs.utimesSync(new URL('../app.js', import.meta.url), now, now)
await tablet.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
const reloaded = await tablet.waitForFunction(() => !window.oldPage, null, {timeout: 10000}).then(() => true, () => false)
const joinAgain = await tablet.waitForSelector('#joinBtn', {timeout: 10000}).then(() => true, () => false)
check(reloaded && joinAgain, 'a new version reloads the page outside a call (back on the Join screen, not joined by itself)')
await browser.close()
