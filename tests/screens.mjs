// Screenshots on the screens a family really has, into tests/out/ (gitignored). Look at every one after a layout
// change. Sizes are the space the browser leaves (Safari's or Chrome's bars taken off), upright and sideways.
// The child's phone sends a tall picture (tests/cleo.y4m, made on first run from a picture), as a phone on a stand does.
// For each device: home; reading a short page and a long one (the reader's view, with the child's tall video);
// and the child's view (the slim book bar). usage: node tests/screens.mjs [device name filter]
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {chromium} from 'playwright-core'
import {browser, check, member, joinCall, waitSeeing, testRoom, familyUrl} from './lib.mjs'
fs.mkdirSync(new URL('out/', import.meta.url), {recursive: true})
const out = n => new URL(`out/${n}.png`, import.meta.url).pathname

const devices = {
  iPhoneSE: [375, 547], iPhoneSE_side: [667, 323],
  iPhone15: [393, 659], iPhone15_side: [852, 341],
  pixel: [412, 783], pixel_side: [915, 358],
  pixelBigText: [330, 627],                 // Android with large text: the same phone, fewer CSS pixels
  iPadMini: [744, 1062], iPadMini_side: [1133, 674],
  iPad: [820, 1106], iPad_side: [1180, 746],
  iPadPro: [1024, 1292], iPadPro_side: [1366, 950],
  laptop: [1440, 789], smallLaptop: [1280, 609],
}
const only = process.argv[2]

// A tall video standing in for the child's phone on its stand.
const cleoVideo = new URL('cleo.y4m', import.meta.url).pathname
if (!fs.existsSync(cleoVideo)) {
  const png = new URL('cleo.png', import.meta.url).pathname
  execFileSync('magick', ['-size', '480x640', 'gradient:#f6d7a7-#7aa6c2', '-fill', '#5b3a29', '-draw', 'circle 240,250 240,150',
    '-fill', '#e9c39b', '-draw', 'circle 240,270 240,190', '-fill', '#c0392b', '-draw', 'rectangle 150,420 330,600', png])
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', png, '-t', '2', '-r', '10', '-pix_fmt', 'yuv420p', cleoVideo])
  fs.rmSync(png)
}
const phones = await chromium.launch({executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cleoVideo}`,
    '--autoplay-policy=no-user-gesture-required']})

for (const [name, [w, h]] of Object.entries(devices)) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue
  const mobile = Math.min(w, h) < 1100
  const room = testRoom()
  const cleoCtx = await phones.newContext({viewport: {width: 390, height: 700}, isMobile: true, hasTouch: true})
  const cleo = await cleoCtx.newPage()
  await cleo.goto(familyUrl(undefined, {name: 'Cleo', room})); await cleo.waitForSelector('#joinCallBtn')
  const g = await member('Gramma', {room, width: w, height: h, mobile})
  await g.waitForSelector('#homeShelf .cover'); await g.screenshot({path: out(`${name}-1-home`)})
  await joinCall(g); await joinCall(cleo)
  await waitSeeing(g, 1); await waitSeeing(cleo, 1)
  if (!(await g.isVisible('#book'))) await g.click('#bookToggle')
  await g.locator('#shelf .cover', {hasText: 'Help-a-Lot'}).click(); await g.waitForSelector('#pageText')
  for (let i = 0; i < 5; i++) await g.click('#nextBtn')
  await g.waitForTimeout(2000); await g.screenshot({path: out(`${name}-2-reading`)})
  await g.click(await g.isVisible('#shelfBtn') ? '#shelfBtn' : '#nav .navLabel'); await g.locator('#shelf .cover', {hasText: 'Frog and Toad'}).click()
  await g.locator('#shelf .storyList button').first().click(); await g.waitForSelector('#pageText')
  await g.click('#nextBtn'); await g.click('#nextBtn')
  await g.waitForTimeout(2000); await g.screenshot({path: out(`${name}-3-long-page`)})
  // The same device as the child's (the slim bar, no page panel).
  if (await g.isVisible('#book')) await g.click('#bookToggle')
  await g.waitForTimeout(800); await g.screenshot({path: out(`${name}-4-bar`)})
  await g.context().close(); await cleoCtx.close()
}
check(true, 'screenshots in tests/out/')
await phones.close(); await browser.close()
