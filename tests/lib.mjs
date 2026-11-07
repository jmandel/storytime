// Shared setup for the browser tests: headless Chromium with a fake camera and microphone.
// Settings come from the repo's .env: STORYTIME_URL (default http://127.0.0.1:8092/), STORYTIME_FAMILY_KEY;
// CHROMIUM (default /usr/bin/chromium) can be set in the environment.
import fs from 'node:fs'
import {chromium} from 'playwright-core'

const envFile = new URL('../.env', import.meta.url).pathname
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
// A test that throws (a timeout, a missing element) reports it as a failure instead of a bare stack trace.
process.on('uncaughtException', e => { console.log(`FAIL ${e.message.split('\n')[0]}`); process.exit(1) })

export const URL_ = process.env.STORYTIME_URL || 'http://127.0.0.1:8092/'
// The family whose books are in books/ (npm run family made it); tests that need their own call use fresh families.
export const FAMILY = process.env.STORYTIME_FAMILY_KEY
if (!FAMILY) throw new Error('STORYTIME_FAMILY_KEY missing: run npm run family')
const rand = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
// A family link: our family by default (its books), or a fresh one (fresh()). opts: {name, n, call, extra}.
export const fresh = rand
export function familyUrl(f = FAMILY, {name, n = 'Test family', call = false, extra = '', room} = {}) {
  const p = new URLSearchParams({f, n})
  if (room) p.set('room', room)
  if (name) p.set('name', name)
  return `${URL_}#${p}${call ? '&call' : ''}${extra}`
}
// A device (its own browser context) that has opened the family link as <name>, on the home screen.
// room: our family's books with a call of its own (so tests never join the real family's call).
export async function member(name, {f = FAMILY, room, width = 1180, height = 820, mobile = false} = {}) {
  const p = await page(width, height, mobile)
  await p.goto(familyUrl(f, {name, room}))
  await p.waitForSelector('#joinCallBtn')
  return p
}
// Join the call from the home screen (a tap, so no second Join).
export async function joinCall(p) {
  await p.click('#joinCallBtn')
  await p.waitForSelector('#leaveBtn')
}
// How many other people's video this screen is getting.
export const seeing = p => p.evaluate(() => [...document.querySelectorAll('#grid video.remote')].filter(v => v.videoWidth > 0).length)
export const waitSeeing = (p, n, timeout = 60000) =>
  p.waitForFunction(n => [...document.querySelectorAll('#grid video.remote')].filter(v => v.videoWidth > 0).length >= n, n, {timeout}).then(() => true, () => false)
export const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
export async function page(width, height, mobile = false) {
  const p = await (await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile})).newPage()
  p.on('pageerror', e => { console.log('page error:', e.message); process.exitCode = 1 })
  return p
}
export const testRoom = () => Math.random().toString(36).slice(2)
export function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) process.exitCode = 1
}
