// A family: started on the welcome screen, its link opened on another device (which asks who is using it), the
// name and family settings, and removing the family from a device.
import {browser, page, check, URL_} from './lib.mjs'
const stubShare = p => p.evaluate(() => {
  Object.defineProperty(navigator, 'share', {value: undefined})
  navigator.clipboard.writeText = async t => { window.copied = t }
  window.alert = () => {}
})
const dad = await page(390, 844, true)
dad.on('dialog', d => d.accept())
await dad.goto(URL_); await dad.waitForSelector('#startFamilyBtn')
check(await dad.locator('#homeShelf .cover').count() > 0, `a new device shows the books anyone can read (${await dad.locator('#homeShelf .cover').count()})`)
await dad.click('#startFamilyBtn')
await dad.fill('#familyName', 'The Testers'); await dad.fill('#myName', 'Dad'); await dad.click('#createFamilyBtn')
await dad.waitForSelector('#joinCallBtn')
check(await dad.textContent('#familyTitle') === 'The Testers' && await dad.textContent('#whoAmI') === 'Dad', 'starting a family names it and the person')

await stubShare(dad)
await dad.click('#shareFamilyBtn'); await dad.waitForFunction(() => window.copied)
const link = await dad.evaluate(() => window.copied)
const params = new URLSearchParams(link.split('#')[1])
check(params.get('f')?.length === 43 && params.get('n') === 'The Testers', 'the family link carries the key and the name')

await dad.reload(); await dad.waitForSelector('#joinCallBtn')
check(await dad.textContent('#familyTitle') === 'The Testers', 'the family stays on the device')

const gramma = await page(1180, 820)
await gramma.goto(link); await gramma.waitForSelector('#whoForm')
check(!(await gramma.evaluate(() => location.hash)).includes('f='), 'the key is taken out of the address bar')
await gramma.fill('#whoName', 'Gramma'); await gramma.click('#whoBtn'); await gramma.waitForSelector('#joinCallBtn')
check(await gramma.textContent('#whoAmI') === 'Gramma', 'a new device asks who is using it')

await gramma.click('#settingsBtn'); await gramma.fill('#set_me', 'Grammie'); await gramma.click('#settingsSave')
check(await gramma.textContent('#whoAmI') === 'Grammie', 'Settings changes the name')
gramma.on('dialog', d => d.accept())
await gramma.click('#settingsBtn'); await gramma.click('#settingsLeave'); await gramma.waitForSelector('#startFamilyBtn')
check(true, 'removing the family goes back to the welcome screen')
await gramma.goto('about:blank'); await gramma.goto(link); await gramma.waitForSelector('#joinCallBtn')
check(await gramma.textContent('#whoAmI') === 'Grammie', 'opening the link again rejoins the family (the name is kept)')
await browser.close()
