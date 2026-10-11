// Two devices connect through the public relays; a third with the wrong secret is turned away.
import {browser, page, room, check, URL_} from './lib.mjs'
const r = room(), base = `${URL_}#r=${r}&k=secret-${r}`
const child = await page(390, 844, true), reader = await page(1180, 820)
const t0 = Date.now()
await child.goto(`${base}&as=child`); await child.click('#joinBtn')
await reader.goto(`${base}&as=reader`); await reader.click('#joinBtn')
const video = p => p.waitForFunction(() => document.getElementById('remote').videoWidth > 0, null, {timeout: 45000}).then(() => true, () => false)
check(await video(child) && await video(reader), `call connects (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
check(/Connected/.test(await reader.textContent('#status')), `status: ${await reader.textContent('#status')}`)
const intruder = await page(390, 844, true)
await intruder.goto(`${URL_}#r=${r}&k=wrong&as=child`); await intruder.click('#joinBtn')
await intruder.waitForTimeout(10000)
check(await intruder.evaluate(() => document.getElementById('remote').videoWidth === 0), 'wrong secret cannot join')
await browser.close()
