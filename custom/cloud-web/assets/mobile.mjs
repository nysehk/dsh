/** Independent compatibility layer; no React, Cordis, or dsh internal imports. */
const basePath = new URL('../', import.meta.url).pathname
const labels = navigator.language.toLowerCase().startsWith('zh')
  ? { open: '展开侧栏', close: '关闭侧栏', new: '新建会话', signOut: '退出登录', error: '退出登录失败，请重试' }
  : { open: 'Open sidebar', close: 'Close sidebar', new: 'New session', signOut: 'Sign out', error: 'Sign out failed. Try again' }
const mobile = matchMedia('(max-width: 767px)')
let frame
let sidebar
let center
let bar
let backdrop
let previousFocus
let wasOpen = false
let session
let selectedPanel

const sessionResponse = await fetch(`${basePath}__cloud/session`, { cache: 'no-store' })
if (sessionResponse.status === 401) location.replace(basePath)
else if (sessionResponse.ok) session = await sessionResponse.json()

function createButton(label, action) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', action)
  return button
}
function sourceButtons() {
  const buttons = [...(sidebar?.querySelectorAll('button') ?? [])]
  // The sidebar owns the real actions. The extension forwards clicks instead
  // of copying the Session Controller or maintaining another UI state store.
  return {
    toggle: buttons.find(button => /侧.?栏|sidebar/iu.test(button.getAttribute('aria-label') ?? '')),
    newSession: buttons.find(button => /^(新建会话|新建对话|new session|new chat)$/iu.test(button.getAttribute('aria-label') ?? '')),
  }
}
function toggle() { sourceButtons().toggle?.click() }
function closeDrawer() { if (frame && !frame.hasAttribute('data-sidebar-collapsed')) toggle() }
function update() {
  const bottom = document.querySelector('[data-shell-bottom]')
  const nextFrame = bottom?.parentElement
  const right = nextFrame?.querySelector(':scope > [data-rightbar-col]')
  if (!right) return
  if (nextFrame !== frame) {
    bar?.remove(); backdrop?.remove()
    frame = nextFrame
    center = right.previousElementSibling
    sidebar = center?.previousElementSibling
    if (!sidebar || !center) return
    selectedPanel = sidebar.querySelector('[aria-current="page"]')?.getAttribute('aria-label')
    frame.dataset.cloudFrame = ''
    sidebar.dataset.cloudSidebar = ''
    center.dataset.cloudMain = ''
    right.dataset.cloudRight = ''
    bar = document.createElement('nav')
    bar.className = 'cloud-navigation'
    bar.setAttribute('aria-label', 'DeepSeek Harness')
    const open = createButton(labels.open, toggle)
    open.dataset.cloudToggle = ''
    const newSession = createButton(labels.new, () => { sourceButtons().newSession?.click(); closeDrawer() })
    newSession.dataset.cloudNew = ''
    bar.append(open, newSession)
    if (session) {
      const account = document.createElement('span')
      account.className = 'cloud-account-name'
      account.textContent = session.username
      bar.append(account)
      const signOut = createButton(labels.signOut, async () => {
        signOut.disabled = true
        try {
          const response = await fetch(`${basePath}__cloud/logout`, { method: 'POST', headers: { 'x-cloud-csrf': session.csrf } })
          if (!response.ok) throw new Error('logout failed')
          location.replace(basePath)
        } catch {
          signOut.disabled = false
          signOut.textContent = labels.error
        }
      })
      signOut.className = 'cloud-sign-out'
      bar.append(signOut)
    }
    backdrop = createButton(labels.close, closeDrawer)
    backdrop.className = 'cloud-drawer-backdrop'
    backdrop.tabIndex = -1
    frame.append(bar, backdrop)
  }
  const activePanel = sidebar.querySelector('[aria-current="page"]')?.getAttribute('aria-label')
  if (mobile.matches && wasOpen && selectedPanel !== activePanel) closeDrawer()
  selectedPanel = activePanel
  const open = mobile.matches && !frame.hasAttribute('data-sidebar-collapsed')
  frame.toggleAttribute('data-cloud-mobile', mobile.matches)
  frame.toggleAttribute('data-cloud-drawer-open', open)
  sidebar.inert = mobile.matches && !open
  center.inert = open
  frame.querySelector('[data-cloud-right]').inert = open
  bar.querySelector('[data-cloud-toggle]').setAttribute('aria-expanded', String(open))
  if (open && !wasOpen) {
    previousFocus = document.activeElement
    sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); sidebar.setAttribute('aria-label', 'DeepSeek Harness')
    // The stock rail becomes a drawer via CSS; its own controls still perform
    // expansion/collapse and render the wide workspace content.
    sourceButtons().toggle?.focus()
  } else if (!open && wasOpen) {
    sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); sidebar.removeAttribute('aria-label')
    if (previousFocus?.isConnected) previousFocus.focus()
  }
  wasOpen = open
  measureViewport()
}
function measureViewport() {
  if (!frame) return
  const viewport = window.visualViewport
  if (mobile.matches && (!viewport || viewport.scale === 1)) {
    const height = `${viewport?.height ?? innerHeight}px`
    frame.style.setProperty('--cloud-viewport-height', height)
    document.documentElement.style.setProperty('--cloud-visible-height', height)
  } else {
    frame.style.removeProperty('--cloud-viewport-height')
    document.documentElement.style.removeProperty('--cloud-visible-height')
  }
}
let pending = false
function schedule() {
  if (pending) return
  pending = true
  requestAnimationFrame(() => { pending = false; update() })
}
const observer = new MutationObserver(schedule)
observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-sidebar-collapsed', 'aria-current'] })
mobile.addEventListener('change', schedule)
window.visualViewport?.addEventListener('resize', measureViewport)
window.addEventListener('resize', schedule)
// Close after navigation while preserving settings dialogs and workspace menus.
document.addEventListener('click', event => {
  const button = event.target.closest?.('button, [role="button"]')
  if (!mobile.matches || !wasOpen || !button || !sidebar?.contains(button)) return
  if (button.hasAttribute('aria-current') || button.hasAttribute('data-session-id')) closeDrawer()
})
document.addEventListener('keydown', event => {
  if (!wasOpen || event.defaultPrevented) return
  if (event.key === 'Escape') { event.preventDefault(); closeDrawer() }
  if (event.key !== 'Tab' || !sidebar.contains(event.target)) return
  const controls = [...sidebar.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
    .filter(element => element.getClientRects().length > 0)
  const first = controls[0], last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
})
window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
schedule()
