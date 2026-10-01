/** Deployment login before the authenticated Web plugin tree starts. */
import { useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrandWordmark, Button } from '@deepseek-ai/dsh-client-ui-primitives'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css'
import css from './login.module.css'
import { en, zh } from './locales/login.ts'
const copy = navigator.language.startsWith('zh') ? zh : en
document.documentElement.lang = copy === zh ? 'zh-CN' : 'en'
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
if (document.documentElement.dataset.theme === 'dark') document.body.setAttribute('data-ds-dark-theme', '')

function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [visible, setVisible] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('./auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }),
      })
      if (response.status === 204) location.replace('./')
      else setError(response.status === 401 ? copy.invalid : copy.failed)
    } catch (_error) {
      // Network failures keep the form available for another attempt.
      setError(copy.failed)
    } finally { setBusy(false) }
  }
  return <main className={css.page}>
    <form className={css.card} aria-label={copy.title} onSubmit={(event) => { void submit(event) }}>
      <div className={css.brand} aria-label={copy.brand}><BrandWordmark size={36} /></div>
      <div className={css.fields}>
        <input aria-label={copy.username} placeholder={copy.username} name="username" autoComplete="username" required autoFocus disabled={busy} />
        <div className={css.password}>
          <input aria-label={copy.password} placeholder={copy.password} name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} />
          <button type="button" className={css.visibility} aria-label={visible ? copy.hidePassword : copy.showPassword} aria-pressed={visible} disabled={busy} onClick={() => { setVisible(value => !value) }}>{visible ? copy.hidePassword : copy.showPassword}</button>
        </div>
        <p className={css.description}>{copy.description}</p>
        <p role="alert" className={css.error}>{error ?? '\u00a0'}</p>
      </div>
      <Button type="submit" variant="primary" className={css.submit} disabled={busy}>
        {busy ? copy.signingIn : copy.signIn}
      </Button>
    </form>
  </main>
}

const root = document.getElementById('root')
if (root === null) throw new Error('web login: missing #root')
createRoot(root).render(<Login />)
