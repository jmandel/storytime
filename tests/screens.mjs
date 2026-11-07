// Screenshots of every screen at six device sizes, into tests/out/ (gitignored). Look at them after layout changes.
import fs from 'node:fs'
import {browser, page, check, member, joinCall, waitSeeing, testRoom, URL_} from './lib.mjs'
fs.mkdirSync(new URL('out/', import.meta.url), {recursive: true})
const out = n => new URL(`out/${n}.png`, import.meta.url).pathname
const sizes = {smallPhone: [360, 640, true], phone: [390, 844, true], phoneSideways: [844, 390, true],
  tablet: [820, 1180, true], tabletSideways: [1180, 820, true], laptop: [1440, 900, false]}
for (const [n, [w, h, mobile]] of Object.entries(sizes)) {
  const welcome = await page(w, h, mobile)
  await welcome.goto(URL_); await welcome.waitForSelector('#homeShelf .cover')
  await welcome.screenshot({path: out(`${n}-1-welcome`)})
  const room = testRoom()
  const a = await member('Gramma', {room, width: w, height: h, mobile}), b = await member('Cleo', {room, width: w, height: h, mobile})
  await a.waitForSelector('#homeShelf .cover'); await a.screenshot({path: out(`${n}-2-home`)})
  await joinCall(a); await a.screenshot({path: out(`${n}-3-waiting`)})
  await joinCall(b); await waitSeeing(a, 1); await waitSeeing(b, 1)
  if (!(await a.isVisible('#book'))) await a.click('#bookToggle')
  await a.locator('#shelf .cover', {hasText: 'Ghost Cub'}).click(); await a.waitForSelector('#strip img', {timeout: 20000})
  for (let i = 0; i < 3; i++) await a.click('#nextBtn')
  await a.waitForTimeout(1500)
  await a.screenshot({path: out(`${n}-4-call-page`)}); await b.screenshot({path: out(`${n}-5-call-other`)})
  for (const p of [welcome, a, b]) await p.context().close()
}
check(true, 'screenshots in tests/out/')
await browser.close()
