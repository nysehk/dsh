/** Configure or rotate the single operator account. Secrets never appear in output. */
import { configureAccount } from './auth.mjs'
import { readConfig } from './config.mjs'

try {
  const config = readConfig()
  await configureAccount(config.stateDirectory, process.env.DSH_WEB_USERNAME, process.env.DSH_WEB_PASSWORD)
  console.log('Cloud-web account saved. Restart cloud-web to apply it.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
