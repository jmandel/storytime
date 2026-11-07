// Back moves around inside Storytime (closing the screen on top) and only asks before leaving a call or the site.
import {browser, page, check, familyUrl, testRoom, FAMILY} from './lib.mjs'
const p = await page(390, 844, true)
let answer = false, asked = []
p.on('dialog', d => { asked.push(d.message()); answer ? d.accept() : d.dismiss() })
const back = async () => { asked = []; await p.goBack({timeout: 3000}).catch(() => {}); await p.waitForTimeout(600) }
await p.goto('about:blank')
await p.goto(familyUrl(FAMILY, {name: 'Dad', room: testRoom()}))
await p.waitForSelector('#joinCallBtn')

await p.click('#settingsBtn'); await back()
check(asked.length === 0 && !(await p.isVisible('#settings')) && await p.isVisible('#joinCallBtn'), 'Back closes Settings')
await p.click('#settingsBtn'); await p.click('#settingsClose'); await back()
check(asked.includes('Leave Storytime?') && await p.isVisible('#joinCallBtn'), 'closing Settings with its button leaves no extra Back step')

await p.locator('#homeShelf .cover', {hasText: 'Frog and Toad'}).click(); await back()
check(asked.length === 0 && await p.locator('#homeShelf .storyList').count() === 0, "Back closes a collection's contents")

await p.locator('#homeShelf .cover', {hasText: "Little Owl's Day"}).click(); await p.waitForSelector('#viewer')
await back()
check(asked.length === 0 && await p.isVisible('#joinCallBtn'), 'Back closes a book')

await p.click('#joinCallBtn'); await p.waitForSelector('#leaveBtn')
await p.click('#bookToggle'); await p.waitForSelector('#book #shelf .cover', {timeout: 15000}).catch(() => {})
await p.locator('#book #shelf .cover', {hasText: 'Frog and Toad'}).click()
await back()
check(asked.length === 0 && await p.locator('#book .storyList').count() === 0 && await p.isVisible('#leaveBtn'), "in a call, Back closes a collection's contents")
await back()
check(asked.includes('Leave the call?') && await p.isVisible('#leaveBtn'), 'Back in a call asks; Cancel stays in the call')
answer = true; await back()
check(asked.includes('Leave the call?') && await p.isVisible('#joinCallBtn'), 'confirming leaves the call for home (not the site)')

answer = false
await p.click('#joinCallBtn'); await p.waitForSelector('#leaveBtn')
asked = []; await p.click('#leaveBtn'); await p.waitForSelector('#joinCallBtn'); await p.waitForTimeout(300)
check(asked.length === 0, 'the Leave button leaves without asking')

await back()
check(asked.includes('Leave Storytime?') && await p.isVisible('#joinCallBtn'), 'Back at home asks; Cancel stays')
answer = true; await back(); await p.waitForTimeout(1000)
check(!p.url().startsWith(familyUrl().split('#')[0]) || p.url() === 'about:blank', `confirming leaves Storytime (now at ${p.url()})`)
await browser.close()
