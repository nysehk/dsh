/** Standalone, script-free login page, independent of the dsh frontend build. */
const zh = { title: '登录 DeepSeek Harness', intro: '登录后继续你的工作', username: '账号', password: '密码', submit: '登录', invalid: '账号或密码不正确', limited: '登录尝试过于频繁，请稍后重试' }
const en = { title: 'Sign in to DeepSeek Harness', intro: 'Sign in to continue your work', username: 'Username', password: 'Password', submit: 'Sign in', invalid: 'Incorrect username or password', limited: 'Too many sign-in attempts. Try again shortly' }

export function loginPage({ csrf, basePath = '/', chinese = false, error }) {
  const t = chinese ? zh : en
  return `<!doctype html><html lang="${chinese ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${t.title}</title><link rel="stylesheet" href="${basePath}__cloud/login.css"></head><body><main>
<h1>${t.title}</h1><p>${t.intro}</p><form method="post" action="${basePath}__cloud/login">
<input type="hidden" name="csrf" value="${csrf}">
<label>${t.username}<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required${error ? ' aria-invalid="true" aria-describedby="login-error"' : ''}></label>
<label>${t.password}<input name="password" type="password" autocomplete="current-password" required${error ? ' aria-invalid="true" aria-describedby="login-error"' : ''}></label>
${error ? `<p id="login-error" role="alert">${t[error]}</p>` : ''}
<button type="submit">${t.submit}</button></form></main></body></html>`
}
