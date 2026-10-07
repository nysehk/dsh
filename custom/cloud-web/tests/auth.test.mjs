import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Accounts, configureAccount, readAccount, sameOrigin } from '../auth.mjs'
import { readConfig } from '../config.mjs'

test('persists only a salted verifier and verifies exact credentials', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cloud-auth-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await configureAccount(directory, 'operator', 'Test-password-12345')
  const text = await readFile(join(directory, 'account.json'), 'utf8')
  assert.ok(!text.includes('Test-password-12345'))
  const auth = new Accounts(await readAccount(directory))
  assert.equal(await auth.verify('operator', 'Test-password-12345'), true)
  assert.equal(await auth.verify('Operator', 'Test-password-12345'), false)
  assert.equal(await auth.verify('operator', 'wrong'), false)
  await configureAccount(directory, 'operator', 'short')
  assert.equal(await new Accounts(await readAccount(directory)).verify('operator', 'short'), true)
  await assert.rejects(configureAccount(directory, 'operator', ''))
})

test('binds sessions to authority, expires them and bounds memory', () => {
  let now = 0
  const auth = new Accounts({}, { sessionSeconds: 10, maxSessions: 2, now: () => now })
  const first = auth.issue('app.example:3080')
  const headers = { host: 'app.example:3080', cookie: `dsh-cloud-session=${first}` }
  assert.equal(auth.session(headers), first)
  assert.equal(auth.session({ ...headers, host: 'other.example:3080' }), undefined)
  assert.equal(auth.session({ ...headers, cookie: `${headers.cookie}; ${headers.cookie}` }), undefined)
  auth.issue('app.example:3080'); auth.issue('app.example:3080')
  assert.equal(auth.session(headers), undefined)
  assert.equal(auth.sessions.size, 2)
  now = 10000
  auth.prune()
  assert.equal(auth.sessions.size, 0)
  assert.match(auth.cookie('token', '/', true), /HttpOnly; SameSite=Strict; Secure$/u)
})

test('limits login work before hashing, isolates clients and expires budgets', () => {
  let now = 0
  const auth = new Accounts({}, { maxAttempts: 2, retrySeconds: 60, maxClients: 2, now: () => now })
  assert.equal(auth.reserveAttempt('first'), 0)
  assert.equal(auth.reserveAttempt('first'), 0)
  assert.equal(auth.reserveAttempt('first'), 60)
  assert.equal(auth.reserveAttempt('second'), 0)
  assert.equal(auth.reserveAttempt('third'), 60)
  now = 60000
  assert.equal(auth.reserveAttempt('third'), 0)
  assert.equal(auth.attempts.size, 1)
})

test('allows remote authorities but refuses cross-site, opaque and malformed origins', () => {
  assert.equal(sameOrigin({ host: 'harness.example:3080', origin: 'http://harness.example:3080' }), true)
  assert.equal(sameOrigin({ host: 'harness.example', origin: 'https://harness.example' }), true)
  for (const headers of [
    { host: 'harness.example', origin: 'https://attacker.example' },
    { host: 'harness.example', origin: 'null' },
    { host: 'harness.example', 'sec-fetch-site': 'cross-site' },
    { host: 'user@harness.example' }, { host: 'harness.example/path' }, {},
  ]) assert.equal(sameOrigin(headers), false)
  const auth = new Accounts({})
  assert.equal(auth.validCsrf('app.example', auth.csrf('app.example')), true)
  assert.equal(auth.validCsrf('other.example', auth.csrf('app.example')), false)
})

test('validates deployment values and derives HTTPS cookie and mount settings', () => {
  const config = readConfig({ DSH_WEB_PUBLIC_URL: 'https://app.example/dsh' })
  assert.equal(config.basePath, '/dsh/')
  assert.equal(config.secureCookies, true)
  assert.equal(config.host, '0.0.0.0')
  for (const env of [{ DSH_WEB_PORT: '-1' }, { DSH_WEB_SESSION_SECONDS: 'NaN' }, { DSH_WEB_PUBLIC_URL: 'https://user:secret@app.example' }]) {
    assert.throws(() => readConfig(env))
  }
})
