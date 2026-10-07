/** Configure or rotate the single operator account. Secrets never appear in output. */
import { configureAccount } from './auth.mjs'
import { readConfig } from './config.mjs'
import { readFile } from 'node:fs/promises'

try {
  const config = readConfig()
  const accountConfig = JSON.parse(await readFile(new URL('account.json', import.meta.url), 'utf8'))
  await configureAccount(config.stateDirectory, accountConfig.username, accountConfig.password)
  console.log('Cloud-web account saved. Restart cloud-web to apply it.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
