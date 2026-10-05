/** Start a private, stock dsh instance and publish only the password gateway. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readAccount } from './auth.mjs'
import { readConfig } from './config.mjs'
import { createGateway, exchangeUpstreamToken } from './gateway.mjs'

const config = readConfig()
let child
let gateway
let stopping
async function stop() {
  if (stopping) return stopping
  stopping = (async () => {
    await gateway?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      const deadline = setTimeout(() => child.kill('SIGKILL'), 10000)
      deadline.unref()
      await exited
      clearTimeout(deadline)
    }
  })()
  return stopping
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop())

try {
  const account = await readAccount(config.stateDirectory).catch(error => {
    if (error.code === 'ENOENT') throw new Error('Configure the account first: DSH_WEB_USERNAME=... DSH_WEB_PASSWORD=... node custom/cloud-web/configure.mjs')
    throw error
  })
  const env = { ...process.env, DSH_HOME: config.home }
  delete env.DSH_WEB_PASSWORD
  delete env.DSH_WEB_USERNAME
  child = spawn(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'web',
    '--patch', 'apps/web/tests/pin-browse-picker.overlay.yml',
    ...process.argv.slice(2), '--no-open', '--host', '127.0.0.1', '--port', '0',
  ], { cwd: config.repository, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const ready = new Promise((resolve, reject) => {
    let pending = ''
    let matched = false
    const deadline = setTimeout(() => reject(new Error('Private dsh startup timed out.')), config.startupSeconds * 1000)
    const cleanup = () => { clearTimeout(deadline); child.off('error', fail); child.off('exit', exited) }
    const fail = error => { cleanup(); reject(error) }
    const exited = code => fail(new Error(`Private dsh exited during startup (${code}).`))
    child.once('error', fail); child.once('exit', exited)
    const output = chunk => {
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        const token = line.match(/http:\/\/127\.0\.0\.1:\d+\/?\?token=[\w-]+/u)
        if (token && !matched) { matched = true; cleanup(); resolve(token[0]) }
        else if (!/token=/u.test(line)) process.stdout.write(line + '\n')
      }
    }
    child.stdout.on('data', output)
    child.stderr.on('data', chunk => process.stderr.write(chunk.toString().replace(/([?&]token=)[\w-]+/gu, '$1[private]')))
  })
  const upstream = await exchangeUpstreamToken(await ready)
  gateway = await createGateway({ ...config, upstream, account })
  gateway.server.listen(config.port, config.host)
  await once(gateway.server, 'listening')
  const address = gateway.server.address()
  const port = address.port
  console.log(`Cloud-web ready: ${config.publicUrl ?? `http://localhost:${port}${config.basePath}`}`)
  console.log(`Listening on ${config.host}:${port}; private dsh is available only on loopback.`)
  child.once('exit', () => { if (!stopping) { process.exitCode = 1; void stop() } })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
  await stop()
}
