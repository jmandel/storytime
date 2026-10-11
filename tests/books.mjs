// Tonight's stack, book switching and page turns from both sides. Needs at least two books in the library.
// Optional env: STORYTIME_LIB (e.g. books-test/) to use another library folder.
import {browser, page, check, URL_, LK} from './lib.mjs'
const lib = process.env.STORYTIME_LIB ? `&lib=${process.env.STORYTIME_LIB}` : ''
const child = await page(390, 844, true), reader = await page(1180, 820)
await child.goto(`${URL_}#lk=${LK}${lib}&reader=Grandma&child=Cleo`)
await child.waitForSelector('#startShelf button')
// Plain books only (a collection card opens its contents instead of being picked; tests/collections.mjs covers those).
const titles = await child.locator('#startShelf .mini-shelf').last().locator('button:not(:has(.storyCount))').allTextContents()
check(titles.length >= 2, `start screen lists ${titles.length} plain books`)
const [first, second] = titles
await child.locator('#startShelf button', {hasText: second}).last().click()
await child.locator('#startShelf button', {hasText: first}).last().click()
await child.click('#startBtn')
const link = await child.textContent('#linkbox')
check(new URLSearchParams(link.split('#')[1]).get('b')?.split(',').length === 2, 'stack of two in the link')
await child.click('#goBtn'); await child.waitForSelector('#joinBtn'); await child.click('#joinBtn')
await reader.goto(link); await reader.click('#joinBtn'); await reader.waitForSelector('#strip img')
check((await reader.textContent('#bookTitle')) === second, `reader opens the first book of the stack (${second})`)
const badge = () => child.textContent('#pageBadge')
await child.waitForFunction(() => document.getElementById('pageBadge'), null, {timeout: 45000}).catch(() => {})
check((await badge()).includes(second), `phone shows the reader's book: ${await badge()}`)
await child.click('#childNext'); await reader.waitForTimeout(1200)
check((await reader.textContent('#pageNum')) !== 'Cover' || (await badge()).includes('Page 1'), `phone turns the page: ${await reader.textContent('#pageNum')}`)
await child.click('#bookBtn'); await child.locator('#pickerShelf button', {hasText: first}).last().click(); await reader.waitForTimeout(2500)
check((await reader.textContent('#bookTitle')) === first, `phone switches the book to ${first}`)
await reader.click('#nextBtn'); await reader.waitForTimeout(1200)
check((await badge()).includes(first), `reader's page turn reaches the phone: ${await badge()}`)
await browser.close()
