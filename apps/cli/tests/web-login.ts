/** HTTP login for tests booting the shipped Web profile. */

/**
 * Sign in with shipped credentials, or exchange a token from a test-specific composition.
 * @param url - readiness URL printed by the test-owned process.
 * @returns response containing the browser cookie on success.
 */
export function signInWeb(url: string): Promise<Response> {
  if (new URL(url).searchParams.has('token')) return fetch(url, { redirect: 'manual' })
  return fetch(new URL('./auth/login', url), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'user', password: '123456dshZz' }),
  })
}
