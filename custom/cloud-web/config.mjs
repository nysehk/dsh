/** Explicit deployment settings for the independent gateway. */
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function readConfig(env = process.env) {
  const integer = (key, fallback, minimum = 1) => {
    const value = env[key] === undefined ? fallback : Number(env[key])
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${key} must be an integer >= ${minimum}.`)
    return value
  }
  const repository = fileURLToPath(new URL('../..', import.meta.url))
  const home = resolve(env.DSH_HOME ?? join(homedir(), '.dsh'))
  const publicUrl = env.DSH_WEB_PUBLIC_URL ? new URL(env.DSH_WEB_PUBLIC_URL) : undefined
  if (publicUrl && (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash)) {
    throw new Error('DSH_WEB_PUBLIC_URL must be a clean HTTP(S) URL.')
  }
  const basePath = publicUrl?.pathname.replace(/\/?$/u, '/') ?? '/'
  return {
    repository, home, stateDirectory: join(home, 'cloud-web'), basePath,
    publicUrl: publicUrl ? `${publicUrl.origin}${basePath}` : undefined,
    host: env.DSH_WEB_HOST ?? '0.0.0.0', port: integer('DSH_WEB_PORT', 3080, 0),
    secureCookies: env.DSH_WEB_SECURE_COOKIES === 'true' || publicUrl?.protocol === 'https:',
    startupSeconds: integer('DSH_WEB_STARTUP_SECONDS', 120),
    maxFormBytes: integer('DSH_WEB_MAX_FORM_BYTES', 8192),
    maxHtmlBytes: integer('DSH_WEB_MAX_HTML_BYTES', 2 * 1024 * 1024),
    authLimits: {
      sessionSeconds: integer('DSH_WEB_SESSION_SECONDS', 86400),
      maxAttempts: integer('DSH_WEB_LOGIN_ATTEMPTS', 10), retrySeconds: integer('DSH_WEB_RETRY_SECONDS', 60),
      maxSessions: integer('DSH_WEB_MAX_SESSIONS', 128), maxClients: integer('DSH_WEB_MAX_LOGIN_CLIENTS', 1024),
    },
  }
}
