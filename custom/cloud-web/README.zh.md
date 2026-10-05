# Cloud Web 扩展 v0.1.0

[English](README.md) | 中文

在未经修改的 DeepSeek Harness 前加入支持账号密码的 HTTP 和 WebSocket 网关。网关负责登录页、管理员账号、数量受限的会话、CSRF 校验、退出登录和移动端兼容资源。运行时无需新增 npm 依赖，也不导入 dsh 内部实现模块。

中文部署文档为 [部署说明.md](../../部署说明.md)。默认通过服务器 IP 访问，域名可选。

```bash
DSH_HOME="$HOME/.dsh-cloud" \
DSH_WEB_USERNAME=operator DSH_WEB_PASSWORD='replace-with-a-long-password' \
node custom/cloud-web/configure.mjs

DSH_HOME="$HOME/.dsh-cloud" node custom/cloud-web/start.mjs
```

先执行 `pnpm install --frozen-lockfile` 和 `pnpm run build` 构建 dsh。启动器等待内部 dsh 的启动地址，用其 token 换取内部 Cookie，然后启动网关。内部进程仅监听本机的随机端口。启动器隐藏内部 token，并从子进程环境中移除登录密码。网关账号的加盐 scrypt 校验值保存在 `$DSH_HOME/cloud-web/account.json`。更新账号后需要重启。浏览器会话在网关重启时结束；退出登录会使当前会话失效。

运行文件与上游代码分开：

| 文件 | 职责 |
| --- | --- |
| `start.mjs` | 内部 dsh 生命周期、启动就绪和正常关闭 |
| `auth.mjs` | 账号校验、数量受限的会话和登录尝试预算 |
| `gateway.mjs` | HTTP、上传和 WebSocket 代理；登录和退出 |
| `config.mjs` | 部署默认值和环境变量校验 |
| `assets/mobile.mjs` | 移动端导航与浏览器可视区域适配 |
| `assets/mobile.css` | 设置、模型、菜单和插件的局部响应式规则 |
| `assets/login.css`, `login.mjs` | 独立登录页 |

移动端适配器将导航点击交给 dsh 自身的按钮，不维护模型配置、模式状态或插件业务逻辑。它通过 `data-shell-bottom` 和 `data-rightbar-col` 找到主框架，通过 `data-shortcut-modal` 找到设置页。部分响应式规则在这些页面内匹配 CSS Modules 的局部类名。升级 dsh 后运行浏览器回归检查：即便 Git 合并没有冲突，上游 DOM 的变化也可能需要更新适配器。桌面保留原侧栏宽度，并增加独立账号行。

验证方法：

```bash
node --test custom/cloud-web/tests/*.test.mjs
```

测试使用临时账号目录和系统分配的端口，并等待套接字与服务器完成清理。覆盖密码校验、会话到期及撤销、CSRF、远程 Host/Origin 校验、限速、表单大小限制、上传字节完整性、HTML 注入、子路径和 WebSocket 代理，无需真实模型 API 调用。

浏览器检查与截图由扩展自己的测试配置执行：

```bash
DSH_CHROMIUM_PATH=/usr/bin/chromium pnpm exec vitest run \
  --config custom/cloud-web/vitest.config.ts
```

安装了 Playwright 自带 Chromium 时，可省略 `DSH_CHROMIUM_PATH`。截图写入 `custom/cloud-web/.artifacts/`，Git 忽略该目录。测试验证真实表单登录、320/375/390/430px 模型表单、抽屉关闭、模式切换、竖屏/横屏/桌面插件页、深色主题和退出登录，复用现有 `apps/web` 浏览器依赖及无需 API Key 的测试环境。

升级 dsh 后，还可运行上游的模型配置和模型选择浏览器检查：

```bash
DSH_SNAPSHOT=replay pnpm run test:web:built -- \
  apps/web/tests/default-model.e2e.ts \
  apps/web/tests/deepseek-messages-settings.e2e.ts
```

每个 dsh 实例使用一个网关进程。所有浏览器共用同一个 dsh 操作者及其工作区。网关校验外部来源后替换为内部 Host、Origin 和 Cookie，因此内部服务必须保持不能从网络直接访问。登录尝试预算按直接连接的 IP 统计，包括反向代理 IP；网关不信任 `X-Forwarded-For`。HTTPS 公共地址启用 Secure Cookie；直接通过 IP 使用 HTTP 时，Cookie 使用 HttpOnly 和 SameSite 属性。
