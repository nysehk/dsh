/** Deployment account launcher and browser-session logout confirmation. */
import { useRef, useState } from 'react'
import { Button, Menu, Modal, IconUserOutlineMedium, IconSettingsOutlineMedium, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from '../../../ui-theme/src/styles/account-menu.module.css'
import dialog from '../../../ui-theme/src/styles/sign-in-dialog.module.css'

/** @param props - deployment username, sidebar layout and settings navigation.
 * @returns the account launcher, menu and logout confirmation.
 */
export function WebAccountMenu({ username, wide, settingsShortcut, openSettings, t }: PropsRuntime<'settings.launcher'> & PropsLocale<'settings'> & { username: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const dismiss = () => { if (!busy) setConfirm(false) }
  const signOut = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch('./auth/logout', { method: 'POST', credentials: 'same-origin' })
      if (response.status !== 204) throw new Error('logout refused')
      location.replace('./login.html')
    } catch (_error) { setFailed(true); setBusy(false) }
  }
  return <div className={css.root}>
    <Menu open={open} side="top" portal autoFocus className={css.anchor}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide}
        aria-label={`${t('account.menu')}: ${username}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}>
        <span className={css.avatar}><IconUserOutlineMedium size={18} /></span>
        {wide && <span className={css.label}>{username}</span>}
      </button>}
      items={[
        { id: 'settings', label: t('trigger'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'signout', label: t('account.signOut') },
      ]}
      onClose={() => { setOpen(false) }} onSelect={(id) => {
        setOpen(false)
        trigger.current?.focus()
        if (id === 'settings') openSettings()
        else { setFailed(false); setConfirm(true) }
      }} />
    {confirm && <Modal open headless title={t('account.signOut')} onClose={dismiss} className={dialog.dialog as string}>
      <div className={dialog.content}>
        <div className={dialog.header}>
          <h2 className={dialog.title}>{t('account.signOut')}</h2>
          <button type="button" className={dialog.close} aria-label={t('close')} disabled={busy} onClick={dismiss}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <p className={dialog.description}>{t('account.signOutDescription')}</p>
        {failed && <p className={dialog.description} role="alert">{t('account.failed')}</p>}
      </div>
      <div className={dialog.actions}>
        <Button variant="outline" className={dialog.secondaryButton} disabled={busy} onClick={dismiss}>{t('account.cancel')}</Button>
        <Button variant="primary" className={dialog.primaryButton} disabled={busy} onClick={() => { void signOut() }}>{t('account.signOut')}</Button>
      </div>
    </Modal>}
  </div>
}
