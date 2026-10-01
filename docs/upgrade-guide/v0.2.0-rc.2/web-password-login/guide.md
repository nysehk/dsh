---
kind: upgrade-guide
description: "Web startup URLs use deployment password login instead of process-token exchange."
---

# Web deployment login

English | [中文](guide.zh.md)

## Change

The shipped Web profile prints a clean URL and requires a local username and password instead of exchanging the printed process token. Desktop startup authentication is unchanged. Browser automation that opened the startup URL must now complete the login form or POST credentials to `/auth/login` and retain its cookie.

Authenticated LAN browsers now read and save the shared Host settings, including model providers and the Coding Tools preference. Reload the page after upgrading; browser-local choices are not migrated to the Host document.

## Migration

1. Open the printed URL and sign in with username `user` and password `123456dshZz`.
2. Set the deployment account in `$DSH_HOME/profiles/web/cordis.patch.yml`, then restart:

```yaml
- id: connection
  config:
    trustedHosts: !!js ctx.webRuntime.trustedHosts
    localLogin:
      username: user
      password: 123456dshZz
```

3. For LAN access, launch `dsh web --host 0.0.0.0` and use the printed LAN URL. Verify that an incorrect password stays on the login page and the configured credentials open the main UI.
