// The same device in the call twice (a second tab or window, e.g. the link tapped in Messages while the call is
// open): the newest one keeps the call, the other steps aside and can take it back.
import {browser, check, member, joinCall, waitSeeing, fresh} from './lib.mjs'
const f = fresh()
const tablet = await member('Gramma', {f}), phone = await member('Cleo', {f, width: 390, height: 844, mobile: true})
await joinCall(tablet); await joinCall(phone)
check(await waitSeeing(tablet, 1) && await waitSeeing(phone, 1), 'connected')
const again = await tablet.context().newPage()
await again.goto(tablet.url().split('#')[0]); await again.waitForSelector('#joinCallBtn'); await joinCall(again)
check(await tablet.waitForSelector('#moved', {timeout: 20000}).then(() => true, () => false), 'the older tab steps aside')
check(await waitSeeing(again, 1) && await waitSeeing(phone, 1), 'the new tab has the call')
check(await phone.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1, null, {timeout: 20000}).then(() => true, () => false),
  'the others see that device once')
await tablet.click('#useHereBtn')
check(await waitSeeing(tablet, 1) && await again.waitForSelector('#moved', {timeout: 30000}).then(() => true, () => false),
  '"Use this window" takes the call back')
await browser.close()
