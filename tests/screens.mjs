// Screenshots of every screen at six device sizes, into tests/out/ (gitignored). Look at them after layout changes.
import fs from 'node:fs'
import {browser, page, room, URL_, LK} from './lib.mjs'
fs.mkdirSync(new URL('out/', import.meta.url), {recursive: true})
const out = n => new URL(`out/${n}.png`, import.meta.url).pathname
const sizes = {smallPhone: [360, 640, true], phone: [390, 844, true], phoneSideways: [844, 390, true],
  tablet: [820, 1180, true], tabletSideways: [1180, 820, true], laptop: [1440, 900, false]}
const names = '&reader=Grandma&child=Cleo'
for (const [n, [w, h, m]] of Object.entries(sizes)) {
  const start = await page(w, h, m)
  await start.goto(`${URL_}#lk=${LK}${names}`); await start.waitForSelector('#startShelf button')
  await start.screenshot({path: out(`${n}-1-start`)})
  await start.click('#startBtn'); await start.screenshot({path: out(`${n}-2-invite`)})
  const r = room(), base = `${URL_}#r=${r}&k=k${r}&lk=${LK}${names}`
  const child = await page(w, h, m), reader = await page(w, h, m)
  await child.goto(`${base}&as=child`); await child.screenshot({path: out(`${n}-3-join`)}); await child.click('#joinBtn')
  await reader.goto(`${base}&as=reader`); await reader.click('#joinBtn'); await reader.waitForSelector('#strip img')
  await child.waitForFunction(() => document.getElementById('pageBadge').style.display === 'block', null, {timeout: 45000}).catch(() => {})
  for (let i = 0; i < 4; i++) await reader.click('#nextBtn')
  await reader.waitForTimeout(1000)
  await child.screenshot({path: out(`${n}-4-child-call`)}); await reader.screenshot({path: out(`${n}-5-reader-call`)})
  await child.click('#bookBtn'); await child.screenshot({path: out(`${n}-6-child-picker`)})
  await reader.click('#shelfBtn'); await reader.screenshot({path: out(`${n}-7-reader-shelf`)})
  for (const p of [start, child, reader]) await p.context().close()
}
console.log('screenshots in tests/out/')
await browser.close()
