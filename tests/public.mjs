// A family without our library (started in the browser) still has the books anyone can read, in the call too.
import {browser, check, member, joinCall, fresh} from './lib.mjs'
const p = await member('Someone', {f: fresh()})
await p.waitForSelector('#homeShelf .cover', {timeout: 20000})
const covers = await p.locator('#homeShelf .cover .name').allTextContents()
check(covers.length > 0 && !covers.includes('Applesauce on Top'), `public books only: ${covers}`)
await joinCall(p)
await p.locator('#shelf .cover').first().click()
check(await p.waitForSelector('#strip img', {timeout: 20000}).then(() => true, () => false), `a public book opens in the call: ${await p.textContent('#bookTitle')}`)
await browser.close()
