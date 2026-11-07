// The repo's .env (gitignored): read it, and set one value in it.
import fs from 'node:fs'

export const envFile = new URL('../.env', import.meta.url).pathname
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

export function setEnv(name, value) {
  const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
  const line = `${name}=${value}`
  const re = new RegExp(`^${name}=.*$`, 'm')
  fs.writeFileSync(envFile, re.test(env) ? env.replace(re, line) : `${env}${env && !env.endsWith('\n') ? '\n' : ''}${line}\n`, {mode: 0o600})
  process.env[name] = value
}

// The same derivation as src/lib/family.js: HKDF-SHA256 of the family key, no salt, info names the use.
export async function derive(familyKey, info, bytes) {
  const {subtle} = globalThis.crypto
  const base = await subtle.importKey('raw', Buffer.from(familyKey, 'base64url'), 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info)}, base, bytes * 8)
  return Buffer.from(bits)
}
