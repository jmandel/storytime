// Back moves around inside Storytime (closing the screen on top) and only asks before leaving a call or the site.
import {browser, page, check, URL_, LK} from './lib.mjs'
const p = await page(390, 844, true)
let answer = false, asked = []
p.on('dialog', d => { asked.push(d.message()); answer ? d.accept() : d.dismiss() })
const back = async () => { asked = []; await p.goBack({timeout: 3000}).catch(() => {}); await p.waitForTimeout(600) }
await p.goto('about:blank')
await p.goto(`${URL_}#lk=${LK}&reader=Grandma&child=Cleo`)
await p.waitForSelector('#startBtn')

await p.click('#settingsBtn'); await back()
check(asked.length === 0 && !(await p.isVisible('#settings')) && await p.isVisible('#startBtn'), 'Back closes Settings')
await p.click('#settingsBtn'); await p.click('#settingsClose'); await back()
check(asked.includes('Leave Storytime?') && await p.isVisible('#startBtn'), 'closing Settings with its button leaves no extra Back step')

await p.locator('#startShelf button', {hasText: 'Frog and Toad'}).click(); await back()
check(asked.length === 0 && await p.locator('#startShelf .storyList').count() === 0, "Back closes a collection's contents")

await p.click('#viewBtn'); await back()
check(asked.length === 0 && !(await p.isVisible('#browse')), 'Back closes the book list')

await p.click('#startBtn'); await p.waitForSelector('#leaveBtn')
check(await p.isVisible('#shareBtn, #copyBtn'), 'Start a call goes straight into the call, with the link to send there')
await p.click('#bookBtn').catch(() => {}); await p.waitForSelector('#picker', {timeout: 5000}).catch(() => {})
await back()
check(asked.length === 0 && !(await p.isVisible('#picker')) && await p.isVisible('#leaveBtn'), 'in a call, Back closes the book picker')
await back()
check(asked.includes('Leave the call?') && await p.isVisible('#leaveBtn'), 'Back in a call asks; Cancel stays in the call')
answer = true; await back()
check(asked.includes('Leave the call?') && await p.isVisible('#startBtn'), 'confirming leaves the call for the start screen (not the site)')

answer = false
await p.click('#startBtn'); await p.waitForSelector('#leaveBtn')
asked = []; await p.click('#leaveBtn'); await p.waitForSelector('#startBtn'); await p.waitForTimeout(300)
check(asked.length === 0, 'the Leave button leaves without asking')

await back()
check(asked.includes('Leave Storytime?') && await p.isVisible('#startBtn'), 'Back on the start screen asks; Cancel stays')
answer = true; await back(); await p.waitForTimeout(1000)
check(!p.url().startsWith(URL_), `confirming leaves Storytime (now at ${p.url()})`)
await browser.close()
