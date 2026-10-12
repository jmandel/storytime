// Getting out of stuck states: the phone's relay connections dying quietly (the page thinks they're open but nothing
// gets through, as after a phone freezes a background tab), with the phone in the foreground (it tries again by
// itself) or coming back from the background (it tries again straight away); and a second copy of the reader's
// side leaving the first one alone.
import {browser, page, room, check, URL_} from './lib.mjs'
const video = (p, t) => p.waitForFunction(() => document.getElementById('remote')?.videoWidth > 0, null, {timeout: t}).then(() => true, () => false)

// The first connection to each relay goes nowhere: it opens, swallows everything and never answers.
async function deadRelaysAtFirst(p) {
  const seen = new Set()
  await p.routeWebSocket(/^wss:/, ws => {
    if (seen.has(ws.url())) return ws.connectToServer()
    seen.add(ws.url())
    ws.onMessage(() => {})
  })
}
// document.hidden as the page sees it, with the visibilitychange event.
const setHidden = (p, hidden) => p.evaluate(h => {
  Object.defineProperty(document, 'hidden', {configurable: true, get: () => h})
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => h ? 'hidden' : 'visible'})
  document.dispatchEvent(new Event('visibilitychange'))
}, hidden)

async function call(name, {background}) {
  const r = room(), base = `${URL_}#r=${r}&k=s-${r}&reader=Grandma&child=Cleo`
  const phone = await page(390, 844, true), tablet = await page(1180, 820)
  await deadRelaysAtFirst(phone)
  await phone.goto(`${base}&as=child`); await phone.click('#joinBtn')
  if (background) await setHidden(phone, true)
  await tablet.goto(`${base}&as=reader`); await tablet.click('#joinBtn')
  const t0 = Date.now()
  if (background) {
    await phone.waitForTimeout(15000)
    check(!(await video(tablet, 100)), `${name}: not connected while the phone is away`)
    await setHidden(phone, false)
    check(await video(phone, 20000) && await video(tablet, 5000), `${name}: connects once the phone is back (${((Date.now() - t0) / 1000 - 15).toFixed(1)}s)`)
  } else {
    check(await video(phone, 75000) && await video(tablet, 5000), `${name}: connects after the phone tries again (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }
  await phone.context().close(); await tablet.context().close()
}
await call('dead relays', {background: false})
await call('dead relays while sending the link', {background: true})

// A second reader screen while the first waits for the phone: the first stays put (no reload, still in the call).
const r = room(), base = `${URL_}#r=${r}&k=s-${r}&reader=Grandma&child=Cleo&as=reader`
const first = await page(1180, 820), second = await page(1180, 820)
let loads = 0
first.on('load', () => loads++)
await first.goto(base); await first.click('#joinBtn')
await second.goto(base); await second.click('#joinBtn')
check(await second.waitForSelector('#conflict', {timeout: 45000}).then(() => true, () => false), 'second reader screen is told someone is using the link')
await first.waitForTimeout(20000)
check(loads === 1 && await first.isVisible('#waiting') && !(await first.isVisible('#moved')), 'the first reader screen keeps waiting in the call')
await browser.close()
