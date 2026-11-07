// Make this repo's family (once) and print its family link.
// usage: npm run family [-- "Family name"]
// The family key is STORYTIME_FAMILY_KEY in .env (made here if empty); everything else comes from it: the call room,
// the call secret and the key `npm run pack` encrypts the books with. The link points at this repo's GitHub Pages
// site (STORYTIME_SITE in .env overrides it), so it needs no lib=.
import {execFileSync} from 'node:child_process'
import {setEnv} from './env.mjs'

if (!process.env.STORYTIME_FAMILY_KEY) {
  setEnv('STORYTIME_FAMILY_KEY', Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))
  console.log('Made a new family key (STORYTIME_FAMILY_KEY in .env). Run npm run pack before pushing, so the books use it.')
}
if (process.argv[2]) setEnv('STORYTIME_FAMILY_NAME', JSON.stringify(process.argv[2]))
const name = (() => { try { return JSON.parse(process.env.STORYTIME_FAMILY_NAME || '""') } catch { return process.env.STORYTIME_FAMILY_NAME } })()

function site() {
  if (process.env.STORYTIME_SITE) return process.env.STORYTIME_SITE
  const remote = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim()
  const [, owner, repo] = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/) || []
  if (!owner) throw new Error(`can't tell the site from the git remote (${remote}); set STORYTIME_SITE in .env`)
  try { return execFileSync('gh', ['api', `repos/${owner}/${repo}/pages`, '-q', '.html_url'], {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim() }
  catch { return `https://${owner}.github.io/${repo}/` }
}
const p = new URLSearchParams({f: process.env.STORYTIME_FAMILY_KEY})
if (name) p.set('n', name)
console.log(`\nFamily link${name ? ` for ${name}` : ''} (anyone with it is in the family):\n\n  ${site().replace(/^http:/, 'https:').replace(/\/?$/, '/')}#${p}\n`)
if (!name) console.log('Give the family a name: npm run family -- "The Mandels"')
