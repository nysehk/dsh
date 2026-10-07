/** Account storage and bounded, authority-bound browser sessions. No dsh imports. */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

const hashPassword = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, 32, (error, hash) => error ? reject(error) : resolve(hash))
})
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b)

/** Persist a salted verifier, never a plaintext password. Restart to apply account changes. */
export async function configureAccount(directory, username, password) {
  if (!username?.trim() || typeof password !== 'string' || password.length < 1) {
    throw new Error('Set username and password in account config.')
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const salt = randomBytes(32).toString('base64url')
  const hash = await hashPassword(password, salt)
  const temporary = join(directory, `account-${randomBytes(8).toString('hex')}.tmp`)
  await writeFile(temporary, JSON.stringify({ version: 1, username, salt, hash: hash.toString('base64url') }) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, join(directory, 'account.json'))
}

export async function readAccount(directory) {
  const data = JSON.parse(await readFile(join(directory, 'account.json'), 'utf8'))
  if (data.version !== 1 || typeof data.username !== 'string' || !data.username.trim()
    || !/^[\w-]{43}$/.test(data.salt) || !/^[\w-]{43}$/.test(data.hash)) {
    throw new Error('Invalid cloud-web account file. Run configure.mjs again.')
  }
  return data
}

export function authority(headers) {
  const host = headers.host
  if (typeof host !== 'string' || !host || /[\s/@?#\\]/u.test(host)) return undefined
  try {
    const url = new URL(`http://${host}`)
    return url.host
  } catch { return undefined }
}

/** Password authentication is required for every authority; browser initiators must match it. */
export function sameOrigin(headers) {
  const host = authority(headers)
  if (host === undefined || headers['sec-fetch-site'] === 'cross-site') return false
  if (headers.origin === undefined) return true
  if (typeof headers.origin !== 'string') return false
  try {
    const origin = new URL(headers.origin)
    return ['http:', 'https:'].includes(origin.protocol) && new URL(`http://${origin.host}`).host === host
      && origin.username === '' && origin.password === '' && origin.pathname === '/'
  } catch { return false }
}

export class Accounts {
  sessions = new Map()
  attempts = new Map()
  secret = randomBytes(32)

  constructor(account, { sessionSeconds = 86400, maxSessions = 128, maxAttempts = 10, retrySeconds = 60, maxClients = 1024, now = Date.now } = {}) {
    this.account = account
    this.limits = { sessionSeconds, maxSessions, maxAttempts, retrySeconds, maxClients }
    this.now = now
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Cloud-web limits must be positive safe integers.')
    }
  }

  csrf(host) { return createHmac('sha256', this.secret).update(`login:${host}`).digest('base64url') }

  validCsrf(host, value) {
    return typeof value === 'string' && equal(Buffer.from(value), Buffer.from(this.csrf(host)))
  }

  reserveAttempt(client) {
    const now = this.now()
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key)
    let budget = this.attempts.get(client)
    if (!budget) {
      if (this.attempts.size >= this.limits.maxClients) return this.limits.retrySeconds
      budget = { count: 0, until: now + this.limits.retrySeconds * 1000 }
      this.attempts.set(client, budget)
    }
    if (budget.count >= this.limits.maxAttempts) return Math.max(1, Math.ceil((budget.until - now) / 1000))
    budget.count += 1
    return 0
  }

  async verify(username, password) {
    const actual = await hashPassword(password, this.account.salt)
    const correct = equal(actual, Buffer.from(this.account.hash, 'base64url'))
    return correct && username === this.account.username
  }

  issue(host) {
    this.prune()
    if (this.sessions.size >= this.limits.maxSessions) this.sessions.delete(this.sessions.keys().next().value)
    const value = randomBytes(32).toString('base64url')
    this.sessions.set(value, { host, expires: this.now() + this.limits.sessionSeconds * 1000 })
    return value
  }

  prune() {
    const now = this.now()
    for (const [key, value] of this.sessions) if (value.expires <= now) this.sessions.delete(key)
  }

  session(headers) {
    this.prune()
    const cookies = String(headers.cookie ?? '').split(';').map(part => part.trim())
      .filter(part => part.startsWith('dsh-cloud-session='))
    if (cookies.length !== 1) return undefined
    const token = cookies[0].slice('dsh-cloud-session='.length)
    const session = this.sessions.get(token)
    return session?.host === authority(headers) ? token : undefined
  }

  cookie(value, path = '/', secure = false) {
    return `dsh-cloud-session=${value}; Path=${path}; Max-Age=${value ? this.limits.sessionSeconds : 0}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
  }
}
