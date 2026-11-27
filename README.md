# DSH Superagent for Paseo

在 Paseo 侧栏查看 Superagent 概览、来源、触发、评估和工单，并与 DSH 已有的 Router 主会话对话。插件后端运行在 Paseo daemon 上，手机只需连接该 Paseo host。

## 安装

需要 Paseo 0.17.5 或兼容版本，以及提供 `/orchestrator/api/state` 的 DSH Superagent 部署。

```sh
paseo plugin install git:muzhi1991/paseo-dsh-superagent
```

## 选择 DSH 实例

进入 **Paseo 设置 → 插件 → DSH Superagent → DSH 实例**。填写 daemon 能访问的实例根地址。DSH 和 daemon 同机时可以填 `http://127.0.0.1:3083`，端口以实际 profile 为准。

1. 点「测试连接」。插件检查地址是否可达，然后验证 Superagent 状态接口的结构和主 Session ID。
2. 只看管理面板可留空。要访问需要登录的 Router，在 DSH Web 启动终端或服务启动日志中找到登录链接（用 dsh-superagent 脚本启动时见该 checkout 的 `.artifacts/dsh-superagent-<profile>-*.log`）。输入链接里 `token` 的值，可以进一步验证 Router 会话读取。已有连接留空沿用凭据。首次配置可只启用管理视图。
3. 点「验证并保存」。新实例通过验证后替换此 daemon 的连接。错误地址、无 Superagent 的 Web 服务、错误登录令牌都保留原连接。

远端部署可在 daemon 电脑上建立 SSH 转发。例如将本地 3083 转发到远端回环地址的 3083，再配置本机回环地址。原版管理路由会检查 Host 和监听端口，因此转发时应使用相同端口。已配置受信 HTTPS 入口的部署需能同时提供管理和会话路由。

凭据只用于选定实例。插件将 DSH 返回的登录 cookie 写入 daemon 用户的 `$PASEO_HOME/plugin-data/paseo-dsh-superagent/connection.json`，默认位于 `~/.paseo` 下，文件权限为 0600。获准连接此 Paseo daemon 的用户共享该连接及其 Router 权限。

## 使用

- 「执行」可切换进行中和已结束的工单。DSH 与 Paseo 同机且能读取工单绑定文件时，可从详情进入执行 Agent。跨机部署应确保绑定属于所选的 Paseo host。
- 「主 Session」读取真实会话记录并定时刷新，可翻看更早的消息、发消息、选择模型与推理强度、停止当前回合。运行中发送的消息按队列处理。停止 Router 回合与停止执行工单是两种操作。
- 在 Paseo Desktop 和 Web（含手机浏览器）中，回形针直接打开系统文件选择器。每次选择最多 12 个文件，每个最多 2 MiB。Paseo 0.17.5 的原生 iOS/Android 插件屏幕 SDK 尚未提供设备文件选择接口，原生端支持文字对话。聊天记录按持久事件刷新。
- 发送请求的回执按实例和请求号保存在 daemon 上。已确认的重复发送复用回执；上次接收状态未知时，先在主会话核对，避免重复派单。
- 面板为监督视图。来源与策略的编辑、完整管理动作仍可在 DSH Web 使用。通过聊天新建可追踪 Ticket 时，沿用部署自身的触发与准入机制。

## 本地开发

```sh
npm ci --legacy-peer-deps
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-dsh-superagent
```

`client/` 是跨端页面，`shared/` 定义插件 RPC，`server/` 负责 DSH 通信。`design/` 是使用示例数据的交互设计稿。
