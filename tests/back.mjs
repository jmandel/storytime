// Back asks before leaving the start screen or a call; cancelling keeps you where you were.
import {browser, page, check, URL_, LK} from './lib.mjs'
const p = await page(390, 844, true)
let answer = false, asked = []
p.on('dialog', d => { asked.push(d.message()); answer ? d.accept() : d.dismiss() })
await p.goto('about:blank')
await p.goto(`${URL_}#lk=${LK}&reader=Grandma&child=Cleo`)
await p.waitForSelector('#startBtn')
await p.click('#settingsBtn'); await p.click('#settingsClose')  // a user gesture, as on a real phone
await p.goBack(); await p.waitForTimeout(500)
check(asked.includes('Leave Storytime?') && await p.isVisible('#startBtn'), `Back on the start screen asks; Cancel stays (${asked})`)

asked = []
await p.click('#startBtn'); await p.click('#goBtn'); await p.waitForSelector('#joinBtn'); await p.click('#joinBtn')
await p.waitForSelector('#leaveBtn')
await p.goBack(); await p.waitForTimeout(800)
check(asked.includes('Leave the call?') && await p.isVisible('#leaveBtn'), `Back in a call asks; Cancel stays in the call (${asked})`)

asked = []; answer = true
await p.goBack(); await p.waitForTimeout(800)
check(asked.includes('Leave the call?') && await p.isVisible('#startBtn'), 'confirming leaves the call for the start screen')

asked = []; answer = false
await p.click('#startBtn'); await p.click('#goBtn'); await p.waitForSelector('#joinBtn'); await p.click('#joinBtn')
await p.click('#leaveBtn'); await p.waitForSelector('#startBtn'); await p.waitForTimeout(300)
check(asked.length === 0, `the Leave button leaves without asking (${asked})`)

asked = []; answer = true
await p.goBack().catch(() => {}); await p.waitForTimeout(1500)
check(asked.includes('Leave Storytime?') && !p.url().startsWith(URL_), `confirming leaves Storytime (now at ${p.url()})`)
await browser.close()
