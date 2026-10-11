// A call link without a library key still opens public books on the reader's tablet.
import {browser, page, room, check, URL_} from './lib.mjs'
const r = room(), base = `${URL_}#r=${r}&k=k${r}&reader=Grandma&child=Cleo`
const child = await page(390, 844, true), reader = await page(1180, 820)
await child.goto(`${base}&as=child`); await child.click('#joinBtn')
await reader.goto(`${base}&as=reader`); await reader.click('#joinBtn')
await reader.waitForSelector('#shelf button, #strip img', {timeout: 20000})
// With one public book the tablet opens it straight away; with several it shows the shelf.
if (await reader.locator('#shelf button').count()) await reader.locator('#shelf button').first().click()
await reader.waitForSelector('#strip img', {timeout: 20000}).catch(() => {})
check(await reader.locator('#strip img').count() > 0, `a public book opens without a key: ${await reader.textContent('#bookTitle')}`)
await browser.close()
