// Shared setup for the browser tests: headless Chromium with a fake camera and microphone.
// Settings come from the repo's .env: STORYTIME_URL (default http://127.0.0.1:8092/), STORYTIME_LIBRARY_KEY;
// CHROMIUM (default /usr/bin/chromium) can be set in the environment.
import fs from 'node:fs'
import {chromium} from 'playwright-core'

const envFile = new URL('../.env', import.meta.url).pathname
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
// A test that throws (a timeout, a missing element) reports it as a failure instead of a bare stack trace.
process.on('uncaughtException', e => { console.log(`FAIL ${e.message.split('\n')[0]}`); process.exit(1) })

export const URL_ = process.env.STORYTIME_URL || 'http://127.0.0.1:8092/'
export const LK = process.env.STORYTIME_LIBRARY_KEY
if (!LK) throw new Error('STORYTIME_LIBRARY_KEY missing: copy .env.example to .env')
export const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
export async function page(width, height, mobile = false) {
  const p = await (await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile})).newPage()
  p.on('pageerror', e => { console.log('page error:', e.message); process.exitCode = 1 })
  return p
}
export const room = () => Math.random().toString(36).slice(2)
export function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) process.exitCode = 1
}
