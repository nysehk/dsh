import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAccount, readAccount } from '../auth.mjs'
import { createGateway, exchangeUpstreamToken } from '../gateway.mjs'

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cloud-gateway-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await configureAccount(directory, 'operator', 'Test-password-12345')
  const seen = []
  const sockets = new Set()
  const upstream = createServer(async (req, res) => {
    seen.push({ url: req.url, headers: req.headers })
    if (req.url === '/?token=private-launch-token') {
      res.writeHead(303, { 'set-cookie': 'dsh-private=fixture; HttpOnly', location: './' }); res.end(); return
    }
    if (req.headers.cookie !== 'dsh-private=fixture') { res.writeHead(401); res.end(); return }
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'dsh-private=do-not-leak' })
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root">dsh</div></body></html>')
    } else {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(Buffer.concat(chunks))
    }
  })
  upstream.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  upstream.on('upgrade', (req, socket, head) => {
    seen.push({ url: req.url, headers: req.headers })
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    if (head.length) socket.write(head)
    socket.on('data', data => socket.write(data))
  })
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => upstream.close(resolve)) })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`
  const privateSession = await exchangeUpstreamToken(`${upstreamUrl}/?token=private-launch-token`)
  const gateway = await createGateway({ upstream: privateSession, account: await readAccount(directory), ...options })
  t.after(() => gateway.close())
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const url = `http://127.0.0.1:${gateway.server.address().port}`
  const basePath = options.basePath ?? '/'
  const signIn = async (password = 'Test-password-12345') => {
    const page = await fetch(`${url}${basePath}`)
    const html = await page.text()
    const csrf = html.match(/name="csrf" value="([\w-]+)"/u)[1]
    return fetch(`${url}${basePath}__cloud/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url }, body: new URLSearchParams({ username: 'operator', password, csrf }) })
  }
  return { gateway, url, basePath, signIn, seen, upstreamUrl }
}

test('public login protects HTML, APIs and uploads; successful login injects the independent assets', async t => {
  const { url, signIn, seen, upstreamUrl } = await fixture(t)
  const loginPage = await fetch(url)
  assert.match(await loginPage.text(), /autocomplete="current-password"/u)
  assert.equal((await fetch(`${url}/api/private`)).status, 401)
  assert.equal((await fetch(`${url}/?token=private-launch-token`)).headers.get('set-cookie'), null)
  assert.equal(seen.length, 1)
  assert.equal((await signIn('wrong-password')).status, 401)
  const success = await signIn()
  assert.equal(success.status, 303)
  const cookie = success.headers.get('set-cookie').split(';')[0]
  assert.match(cookie, /^dsh-cloud-session=/u)
  const index = await fetch(url, { headers: { cookie } })
  const html = await index.text()
  assert.match(html, /__cloud\/mobile.mjs/u)
  assert.match(html, /viewport-fit=cover/u)
  assert.equal(index.headers.get('set-cookie'), null)
  const bytes = Buffer.from([0, 255, 33, 66])
  const upload = await fetch(`${url}/api/upload`, { method: 'POST', headers: { cookie, origin: url }, body: bytes })
  assert.deepEqual(Buffer.from(await upload.arrayBuffer()), bytes)
  assert.equal(seen.at(-1).headers.origin, upstreamUrl)
  assert.equal(seen.at(-1).headers.cookie, 'dsh-private=fixture')
})

test('rejects CSRF, cross-site login and oversized bodies; rate limits attempts', async t => {
  const { url, signIn } = await fixture(t, { maxFormBytes: 256, authLimits: { maxAttempts: 4 } })
  assert.equal((await fetch(`${url}/__cloud/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=operator&password=wrong&csrf=wrong' })).status, 403)
  assert.equal((await fetch(`${url}/__cloud/login`, { method: 'POST', headers: { origin: 'https://attacker.example' } })).status, 403)
  assert.equal((await fetch(`${url}/__cloud/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=' + 'a'.repeat(300) })).status, 413)
  assert.equal((await signIn('wrong-password')).status, 401)
  assert.equal((await signIn('wrong-password')).status, 401)
  const limited = await signIn()
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
})

test('logout revokes the old cookie; mounted deployment keeps every path under its prefix', async t => {
  const { url, signIn, basePath } = await fixture(t, { basePath: '/dsh/', secureCookies: true })
  const response = await signIn()
  assert.equal(response.headers.get('location'), '/dsh/')
  assert.match(response.headers.get('set-cookie'), /Path=\/dsh\/.*Secure/u)
  const cookie = response.headers.get('set-cookie').split(';')[0]
  const index = await fetch(url + basePath, { headers: { cookie } })
  assert.match(await index.text(), /src="\/dsh\/__cloud\/mobile.mjs"/u)
  const session = await (await fetch(`${url}${basePath}__cloud/session`, { headers: { cookie } })).json()
  assert.equal(session.username, 'operator')
  const logout = await fetch(`${url}${basePath}__cloud/logout`, { method: 'POST', headers: { cookie, 'x-cloud-csrf': session.csrf } })
  assert.equal(logout.status, 204)
  assert.equal((await fetch(`${url}${basePath}api/private`, { headers: { cookie } })).status, 401)
})

test('WebSocket upgrade authenticates and forwards the loopback cookie and same-origin headers', async t => {
  const { url, signIn, seen, upstreamUrl } = await fixture(t)
  const success = await signIn()
  const cookie = success.headers.get('set-cookie').split(';')[0]
  const headers = { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', cookie, origin: url }
  const req = request(`${url}/api/remote.mux`, { headers })
  t.after(() => req.destroy())
  const upgraded = once(req, 'upgrade')
  req.end()
  const [response, socket] = await upgraded
  t.after(() => socket.destroy())
  assert.equal(response.statusCode, 101)
  assert.equal(seen.at(-1).headers.origin, upstreamUrl)
  assert.equal(seen.at(-1).headers.cookie, 'dsh-private=fixture')
  const echoed = once(socket, 'data')
  socket.write('gateway-round-trip')
  assert.equal((await echoed)[0].toString(), 'gateway-round-trip')
  const denied = request(`${url}/api/remote.mux`, { headers: { ...headers, cookie: '' } })
  t.after(() => denied.destroy())
  const rejected = once(denied, 'response')
  denied.end()
  const [unauthorized] = await rejected
  unauthorized.resume()
  assert.equal(unauthorized.statusCode, 401)
})
