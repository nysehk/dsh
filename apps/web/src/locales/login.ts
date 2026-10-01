/** Locale-owned copy for the standalone deployment login page. */

/** English login form labels and failure feedback. */
export const en = {
  brand: 'DeepSeek Harness', showPassword: 'Show', hidePassword: 'Hide',
  title: 'Sign in to DSH', description: 'Use the account configured for this DSH server.',
  username: 'Username', password: 'Password', signIn: 'Sign in', signingIn: 'Signing in…',
  invalid: 'Incorrect username or password.', failed: 'Unable to sign in. Please try again.',
}

/** Chinese login form labels and failure feedback. */
export const zh: typeof en = {
  brand: 'DeepSeek Harness', showPassword: '显示', hidePassword: '隐藏',
  title: '登录 DSH', description: '使用此 DSH 服务配置的账号登录。',
  username: '账号', password: '密码', signIn: '登录', signingIn: '正在登录…',
  invalid: '账号或密码错误。', failed: '登录失败，请重试。',
}
