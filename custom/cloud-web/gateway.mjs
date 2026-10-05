/** Authenticated HTTP/WebSocket proxy in front of an unchanged, private dsh process. */
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Accounts, authority, sameOrigin } from './auth.mjs'
import { loginPage } from './login.mjs'

const assets = new Map([
  ['/__cloud/login.css', ['login.css', 'text/css']],
  ['/__cloud/mobile.css', ['mobile.css', 'text/css']],
  ['/__cloud/mobile.mjs', ['mobile.mjs', 'text/javascript']],
])
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

function headersWithoutHop(headers) {
  const blocked = new Set([...hopHeaders, ...String(headers.connection ?? '').split(',').map(value => value.trim().toLowerCase())])
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key)))
}

async function formBody(req, limit) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return { error: 415 }
  const chunks = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) { req.resume(); return { error: 413 } }
    chunks.push(chunk)
  }
  return { value: new URLSearchParams(Buffer.concat(chunks).toString('utf8')) }
}

/** Only the gateway learns the upstream launch token and its loopback cookie. */
export async function exchangeUpstreamToken(tokenUrl) {
  const url = new URL(tokenUrl)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.searchParams.has('token')) {
    throw new Error('Expected a private loopback dsh token URL.')
  }
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  await response.body?.cancel()
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  if (response.status !== 303 || !cookie) throw new Error('The private dsh browser session could not be initialized.')
  return { url: url.origin, cookie }
}

/** Create a gateway; its caller owns listening and final disposal. */
export async function createGateway({ upstream, account, basePath = '/', secureCookies = false, maxFormBytes = 8192, maxHtmlBytes = 2 * 1024 * 1024, authLimits }) {
  if (!/^\/(?:[A-Za-z0-9._~%/-]*\/)?$/u.test(basePath) || basePath.includes('..')) throw new Error('Invalid cloud-web mount path.')
  const auth = new Accounts(account, authLimits)
  const loadedAssets = new Map()
  for (const [path, [filename, type]] of assets) {
    loadedAssets.set(path, { body: await readFile(new URL(`./assets/${filename}`, import.meta.url)), type })
  }
  const sockets = new Set()
  const outgoing = new Set()
  const unmount = (url) => {
    if (basePath === '/') return url
    return url.startsWith(basePath) ? '/' + url.slice(basePath.length) : undefined
  }
  const login = (req, res, status = 200, error, retryAfter) => {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
    })
    res.end(req.method === 'HEAD' ? undefined : loginPage({
      csrf: auth.csrf(authority(req.headers)), basePath,
      chinese: /^zh\b/iu.test(req.headers['accept-language'] ?? ''), error,
    }))
  }
  const server = createServer(async (req, res) => {
    try {
      const rawPath = unmount(req.url ?? '/')
      if (rawPath === undefined) { res.writeHead(404); res.end(); return }
      const url = new URL(rawPath, 'http://cloud.invalid')
      if (!sameOrigin(req.headers)) { req.resume(); res.writeHead(403); res.end('forbidden'); return }
      const asset = loadedAssets.get(url.pathname)
      if (asset && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(200, { 'content-type': `${asset.type}; charset=utf-8`, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })
        res.end(req.method === 'HEAD' ? undefined : asset.body); return
      }
      if (url.pathname === '/__cloud/login') {
        if (['GET', 'HEAD'].includes(req.method)) { login(req, res); return }
        if (req.method !== 'POST') { req.resume(); res.writeHead(405, { allow: 'GET, HEAD, POST' }); res.end(); return }
        const retry = auth.reserveAttempt(req.socket.remoteAddress ?? 'unknown')
        if (retry) { req.resume(); login(req, res, 429, 'limited', retry); return }
        const body = await formBody(req, maxFormBytes)
        if (body.error) { req.resume(); res.writeHead(body.error); res.end(); return }
        const form = body.value
        if (form.getAll('csrf').length !== 1 || !auth.validCsrf(authority(req.headers), form.get('csrf'))) {
          res.writeHead(403, { 'cache-control': 'no-store' }); res.end('forbidden'); return
        }
        if (form.getAll('username').length !== 1 || form.getAll('password').length !== 1
          || !await auth.verify(form.get('username'), form.get('password'))) {
          login(req, res, 401, 'invalid'); return
        }
        res.writeHead(303, { location: basePath, 'cache-control': 'no-store', 'set-cookie': auth.cookie(auth.issue(authority(req.headers)), basePath, secureCookies) })
        res.end(); return
      }
      const session = auth.session(req.headers)
      if (!session) {
        req.resume()
        if ((url.pathname === '/' || url.pathname === '/index.html') && ['GET', 'HEAD'].includes(req.method)) login(req, res)
        else { res.writeHead(401, { 'cache-control': 'no-store' }); res.end('unauthorized') }
        return
      }
      if (url.pathname === '/__cloud/session') {
        if (req.method !== 'GET') { req.resume(); res.writeHead(405, { allow: 'GET' }); res.end(); return }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ username: account.username, csrf: auth.csrf(authority(req.headers)), basePath })); return
      }
      if (url.pathname === '/__cloud/logout') {
        if (req.method !== 'POST') { req.resume(); res.writeHead(405, { allow: 'POST' }); res.end(); return }
        if (!auth.validCsrf(authority(req.headers), req.headers['x-cloud-csrf'])) { req.resume(); res.writeHead(403); res.end('forbidden'); return }
        req.resume(); auth.sessions.delete(session)
        res.writeHead(204, { 'cache-control': 'no-store', 'set-cookie': auth.cookie('', basePath, secureCookies) }); res.end(); return
      }
      const target = new URL(upstream.url)
      const headers = { ...headersWithoutHop(req.headers), host: target.host, cookie: upstream.cookie, 'accept-encoding': 'identity' }
      delete headers['x-forwarded-host']; delete headers['x-forwarded-proto']; delete headers['x-forwarded-for']
      if (headers.origin !== undefined) headers.origin = target.origin
      const proxy = request(`${target.origin}${url.pathname}${url.search}`, { method: req.method, headers })
      outgoing.add(proxy)
      proxy.once('close', () => outgoing.delete(proxy))
      req.once('aborted', () => proxy.destroy())
      res.once('close', () => { if (!res.writableFinished) proxy.destroy() })
      proxy.once('error', () => { if (!res.headersSent) res.writeHead(502); res.end('dsh unavailable') })
      proxy.once('response', async (response) => {
        try {
          const responseHeaders = headersWithoutHop(response.headers)
          delete responseHeaders['set-cookie']
          if (response.headers['content-type']?.includes('text/html') && req.method !== 'HEAD') {
            const chunks = []
            let size = 0
            for await (const chunk of response) {
              size += chunk.length
              if (size > maxHtmlBytes) throw new Error('Upstream HTML exceeds the configured limit.')
              chunks.push(chunk)
            }
            let html = Buffer.concat(chunks).toString('utf8')
            html = html.replace(/<meta name="viewport"[^>]*>/u, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">')
            html = html.replace('</head>', `<link rel="stylesheet" href="${basePath}__cloud/mobile.css"></head>`)
            html = html.replace('</body>', `<script type="module" src="${basePath}__cloud/mobile.mjs"></script></body>`)
            delete responseHeaders['content-length']; delete responseHeaders.etag
            responseHeaders['cache-control'] = 'no-store'
            res.writeHead(response.statusCode, responseHeaders); res.end(html)
          } else {
            res.writeHead(response.statusCode, responseHeaders)
            await pipeline(response, res)
          }
        } catch {
          if (!res.headersSent) res.writeHead(502)
          res.end('dsh unavailable')
        }
      })
      req.pipe(proxy)
    } catch {
      if (!res.headersSent) res.writeHead(400)
      res.end('invalid request')
    }
  })
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  server.on('upgrade', (req, socket, head) => {
    const rawPath = unmount(req.url ?? '/')
    if (!rawPath || !sameOrigin(req.headers) || !auth.session(req.headers)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return
    }
    const url = new URL(rawPath, 'http://cloud.invalid')
    if (!url.pathname.startsWith('/api/')) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return }
    const target = new URL(upstream.url)
    const headers = { ...headersWithoutHop(req.headers), host: target.host, cookie: upstream.cookie, connection: 'Upgrade', upgrade: 'websocket' }
    if (headers.origin !== undefined) headers.origin = target.origin
    const proxy = request(`${target.origin}${url.pathname}${url.search}`, { headers })
    outgoing.add(proxy)
    proxy.once('close', () => outgoing.delete(proxy))
    socket.once('close', () => proxy.destroy())
    proxy.on('error', () => socket.destroy())
    proxy.once('response', response => { response.resume(); socket.end(`HTTP/1.1 ${response.statusCode} Upgrade Refused\r\nConnection: close\r\n\r\n`) })
    proxy.once('upgrade', (response, upstreamSocket, upstreamHead) => {
      sockets.add(upstreamSocket); upstreamSocket.once('close', () => sockets.delete(upstreamSocket))
      const lines = Object.entries(response.headers).filter(([key]) => key !== 'set-cookie').map(([key, value]) => `${key}: ${value}`)
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`)
      if (upstreamHead.length) socket.write(upstreamHead)
      if (head.length) upstreamSocket.write(head)
      socket.on('error', () => upstreamSocket.destroy()); upstreamSocket.on('error', () => socket.destroy())
      socket.once('close', () => upstreamSocket.destroy()); upstreamSocket.once('close', () => socket.destroy())
      socket.pipe(upstreamSocket).pipe(socket)
    })
    proxy.end()
  })
  return {
    server, auth,
    async close() {
      for (const req of outgoing) req.destroy()
      for (const socket of sockets) socket.destroy()
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}
