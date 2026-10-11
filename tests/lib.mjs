// Shared setup for the browser tests: headless Chromium with a fake camera and microphone.
// Env: STORYTIME_URL (default http://127.0.0.1:8092/), STORYTIME_LK (library key; default read from
// ~/storytime-books/.library-key), CHROMIUM (default /usr/bin/chromium).
import fs from 'node:fs'
import os from 'node:os'
import {chromium} from 'playwright-core'

export const URL_ = process.env.STORYTIME_URL || 'http://127.0.0.1:8092/'
export const LK = process.env.STORYTIME_LK || fs.readFileSync(`${os.homedir()}/storytime-books/.library-key`, 'utf8').trim()
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
