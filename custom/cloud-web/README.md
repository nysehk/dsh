# Cloud Web extension v0.1.0

English | [中文](README.zh.md)

Run an unchanged DeepSeek Harness behind a password-protected HTTP and WebSocket gateway. The gateway owns the login page, operator account, bounded sessions, CSRF checks, logout, and mobile compatibility assets. It has no npm runtime dependencies and imports no dsh implementation modules.

The Chinese deployment guide is [部署说明.md](../../部署说明.md). Direct server-IP access is the default; a domain is optional.

```bash
DSH_HOME="$HOME/.dsh-cloud" \
DSH_WEB_USERNAME=operator DSH_WEB_PASSWORD='replace-with-a-long-password' \
node custom/cloud-web/configure.mjs

DSH_HOME="$HOME/.dsh-cloud" node custom/cloud-web/start.mjs
```

Build dsh with `pnpm install --frozen-lockfile` and `pnpm run build` first. The launcher waits for the private dsh startup URL, exchanges its launch token for an internal cookie, and starts the gateway. The private process binds only loopback on an OS-assigned port. The launcher redacts its token and removes the login password from the child's environment. Gateway accounts are stored as salted scrypt verifiers in `$DSH_HOME/cloud-web/account.json`. Restart after rotating credentials. Browser sessions end on gateway restart; logout revokes the current session.

The runtime files are separate from upstream:

| File | Responsibility |
| --- | --- |
| `start.mjs` | Private dsh lifecycle, readiness, graceful shutdown |
| `auth.mjs` | Account verifier, bounded sessions and attempt budgets |
| `gateway.mjs` | HTTP, upload and WebSocket forwarding; login and logout |
| `config.mjs` | Deployment defaults and environment validation |
| `assets/mobile.mjs` | Mobile navigation and browser viewport adapter |
| `assets/mobile.css` | Scoped responsive settings, model, menu and plugin rules |
| `assets/login.css`, `login.mjs` | Standalone login page |

The mobile adapter forwards navigation clicks to dsh's own buttons. It does not own model configuration, mode state, or plugin business logic. It identifies the frame by `data-shell-bottom` and `data-rightbar-col`, and settings by `data-shortcut-modal`. Some responsive rules use CSS-module local-name fragments within these surfaces. Run browser regression checks after upgrading dsh: an upstream DOM change can require adapter maintenance even when Git merges cleanly. Desktop layouts retain their sidebar widths, with a separate account row.

Validation:

```bash
node --test custom/cloud-web/tests/*.test.mjs
```

Tests use temporary account directories and OS-assigned ports, and await socket/server cleanup. They cover password verification, session expiry and revocation, CSRF, remote Host/Origin checks, rate limits, bounded form bodies, byte-preserving uploads, HTML injection, mount paths, and WebSocket forwarding. No real model API call is required.

Browser checks and screenshots are produced by the owner-local browser lane:

```bash
DSH_CHROMIUM_PATH=/usr/bin/chromium pnpm exec vitest run \
  --config custom/cloud-web/vitest.config.ts
```

Omit `DSH_CHROMIUM_PATH` when Playwright's Chromium is installed. Screenshots are written to `custom/cloud-web/.artifacts/` and are ignored by Git. The lane verifies real form login, 320/375/390/430px model forms, drawer dismissal, a mode switch, plugin pages in portrait/landscape/desktop, dark theme, and logout. It uses the existing `apps/web` browser dependency and keyless scaffold.

The focused upstream browser checks for model configuration and model selection are also useful after a dsh upgrade:

```bash
DSH_SNAPSHOT=replay pnpm run test:web:built -- \
  apps/web/tests/default-model.e2e.ts \
  apps/web/tests/deepseek-messages-settings.e2e.ts
```

Use one gateway process per dsh instance. Every browser speaks for the same dsh operator and shares its workspaces. The gateway validates public origins, then substitutes the private Host, Origin and cookie; the private service must remain inaccessible from the network. Login attempt budgets use the directly connected IP, including a reverse proxy's IP. The gateway does not trust `X-Forwarded-For`. HTTPS public URLs enable Secure cookies; direct IP HTTP deployments use HttpOnly and SameSite cookies.
