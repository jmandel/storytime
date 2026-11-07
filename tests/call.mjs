// The family call: three people join from their home screens and all see each other; someone in another family
// never joins it; leaving goes back home.
import {browser, check, member, joinCall, waitSeeing, fresh} from './lib.mjs'
const f = fresh()
const gramma = await member('Gramma', {f}), cleo = await member('Cleo', {f, width: 390, height: 844, mobile: true})
await joinCall(gramma)
check(await gramma.isVisible('#waiting'), 'alone in the call: waiting, with the family link to send')
await joinCall(cleo)
check(await waitSeeing(gramma, 1) && await waitSeeing(cleo, 1), 'two people see each other')
const dad = await member('Dad', {f, width: 1440, height: 900})
await joinCall(dad)
check(await waitSeeing(dad, 2) && await waitSeeing(gramma, 2) && await waitSeeing(cleo, 2), 'a third person: everyone sees both others')
const names = await cleo.locator('#grid figcaption').allTextContents()
check(names.some(n => n.startsWith('Gramma')) && names.some(n => n.startsWith('Dad')), `names under the videos: ${names}`)

await gramma.click('#cameraBtn')
check(await cleo.waitForFunction(() => [...document.querySelectorAll('#grid .tile.camOff .who')].some(w => w.textContent === 'Gramma'), null, {timeout: 15000}).then(() => true, () => false),
  'turning the camera off shows the name instead (and the call stays up)')
await gramma.click('#cameraBtn')
check(await cleo.waitForFunction(() => !document.querySelector('#grid .tile.camOff'), null, {timeout: 15000}).then(() => true, () => false)
  && await waitSeeing(cleo, 2), 'turning it back on shows the video again')

const stranger = await member('Stranger', {f: fresh()})
await joinCall(stranger); await stranger.waitForTimeout(8000)
check(await stranger.locator('#grid video.remote').count() === 0 && await gramma.locator('#grid .tile').count() === 2, "another family's call is separate")

await dad.click('#leaveBtn'); await dad.waitForSelector('#joinCallBtn')
check(await gramma.waitForFunction(() => document.querySelectorAll('#grid .tile').length === 1, null, {timeout: 20000}).then(() => true, () => false),
  'leaving goes home, and the others stop showing that person')
await browser.close()
