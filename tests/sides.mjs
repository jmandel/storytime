// Who is on which side: there is one link; the phone that started the call opening it lands on its own side; a second
// screen on the reader's link doesn't take over the call unless told to, and then the old screen steps aside.
import {browser, page, check, URL_, LK} from './lib.mjs'
const phoneCtx = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
const phone = await phoneCtx.newPage()
await phone.goto(`${URL_}#lk=${LK}&reader=Grandma&child=Cleo`)
await phone.click('#startBtn'); await phone.waitForSelector('#leaveBtn')
const link = await phone.textContent('#linkbox')
check(!new URLSearchParams(link.split('#')[1]).has('as'), 'the call screen offers the one link, naming no side')

const tablet = await page(1180, 820)
await tablet.goto(link); await tablet.click('#joinBtn')
const video = (p, t = 45000) => p.waitForFunction(() => document.getElementById('remote')?.videoWidth > 0, null, {timeout: t}).then(() => true, () => false)
check(await video(phone) && await video(tablet), 'phone and tablet connect')

const again = await phoneCtx.newPage()
await again.goto(link); await again.waitForSelector('#joinTitle, #leaveBtn')
check(await again.evaluate(() => window.__storytimeCall?.me.role === 'child' || document.getElementById('joinTitle')?.textContent.includes('Grandma')),
  "the same link opened on the phone that started the call is the phone's side")
await again.close()

const other = await page(1180, 820)
await other.goto(link); await other.click('#joinBtn')
const conflict = await other.waitForSelector('#conflict', {timeout: 45000}).then(() => true, () => false)
check(conflict && await other.isVisible('#switchSideBtn'), 'a second screen on the reader link is told someone is already using it')
await phone.waitForTimeout(5000)
check(await tablet.isVisible('#remote') && !(await tablet.isVisible('#moved')) && /Connected/.test(await tablet.textContent('#status')),
  'the first reader screen keeps the call')
await other.click('#takeOverBtn')
check(await tablet.waitForSelector('#moved', {timeout: 15000}).then(() => true, () => false), 'after "use this screen", the old screen steps aside')
check(await video(other, 30000), 'the new screen gets the phone\'s video')
const since = p => p.evaluate(() => window.__storytimeCall?.me.since)
const before = await since(tablet)
await tablet.click('#useHereBtn')
check(await video(tablet, 45000) && (await since(tablet)) > before, '"Use this screen" rejoins the first screen as a new participant and it gets the phone\'s video')
const t1 = Date.now()
const phoneSees = await phone.waitForFunction(() => {
  const c = window.__storytimeCall, p = c?.peers.get(c.state.peerId)
  return p?.since > 0 && p.stream?.getVideoTracks().some(t => !t.muted) && document.getElementById('remote').videoWidth > 0
}, null, {timeout: 30000}).then(() => true, () => false)
check(phoneSees, `the phone gets the returning screen's video (${((Date.now() - t1) / 1000).toFixed(0)}s)`)
check(await other.isVisible('#moved'), 'and the other screen stepped aside')
await browser.close()
