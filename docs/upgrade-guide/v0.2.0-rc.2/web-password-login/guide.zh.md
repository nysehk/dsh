---
kind: upgrade-guide
description: "Web 启动 URL 改用部署账号密码登录，不再交换进程 token。"
---

# Web 部署账号登录

[English](guide.md) | 中文

## 变更

随附 Web profile 打印不含凭据的 URL，要求本地账号密码登录，不再交换打印的进程 token。桌面启动认证不变。打开启动 URL 的浏览器自动化需要完成登录表单，或向 `/auth/login` POST 凭据并保留返回的 cookie。

已认证的局域网浏览器现在读取和保存共享的 Host 设置，包括模型提供商和代码工作工具偏好。升级后刷新页面；浏览器本地选择不会迁移到 Host 文档。

## 迁移

1. 打开打印的 URL，以账号 `user`、密码 `123456dshZz` 登录。
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中设置部署账号，然后重启：

```yaml
- id: connection
  config:
    trustedHosts: !!js ctx.webRuntime.trustedHosts
    localLogin:
      username: user
      password: 123456dshZz
```

3. 局域网访问使用 `dsh web --host 0.0.0.0` 并打开打印的 LAN URL。确认错误密码停留在登录页，配置的凭据可进入主界面。
