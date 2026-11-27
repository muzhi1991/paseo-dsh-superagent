# DSH Superagent for Paseo

在 Paseo 侧栏查看 Superagent 的六个业务页签，并与 DSH 已有的 Router 主会话对话。插件后端运行在 Paseo daemon 上，手机只需连接该 Paseo host。

## 安装

需要 Paseo 0.17.5 或兼容版本，以及提供 `/orchestrator/api/state` 的 DSH Superagent 部署。

```sh
paseo plugin install git:muzhi1991/paseo-dsh-superagent
```

## 选择 DSH 实例

进入 **Paseo 设置 → 插件 → DSH Superagent → DSH 实例**。填写 daemon 能访问的实例根地址。DSH 和 daemon 同机时可以填 `http://127.0.0.1:3083`，端口以实际 profile 为准。

1. 点「测试连接」。插件检查地址是否可达，然后验证 Superagent 状态接口的结构和主 Session ID。
2. 新安装的原版 Superagent 要先在 DSH Web 的 Superagent 面板完成部署检查。GitHub 仓库和账号校验通过后，原版才会创建 Router 主会话。
3. 首次连接或切换实例时，填写该实例的 DSH Web 启动令牌。在运行 Superagent 的 Web profile 的启动终端找到 `dsh web:` 行，复制登录 URL 中的 `token` 参数。用服务脚本启动时，查看该 checkout 的 `.artifacts/dsh-superagent-<profile>-*.log`。
4. 点「验证并保存」。只有 Superagent 检测和 Router 主会话读取均成功才会替换连接。再次验证当前实例时，已保存的有效凭据可以沿用。

**使用 DeepSeek Harness Desktop 时**，欢迎页的「复制登录链接」用于账号登录。Paseo 需要的是运行 Superagent 的 Web profile 的启动链接。如果只打开了桌面窗口，请先用 Desktop 附带的 `dsh` CLI 运行已配置 Superagent 的 Web profile，例如在该 profile 尚未运行时执行 `dsh --profile superagent-dev --no-open`，将示例 profile 名替换为你的实际名称。已由服务管理器启动的实例直接查看启动日志。

远端部署可在 daemon 电脑上建立 SSH 转发。例如将本地 3083 转发到远端回环地址的 3083，再配置本机回环地址。原版管理路由会检查 Host 和监听端口，因此转发时应使用相同端口。已配置受信 HTTPS 入口的部署需能同时提供管理和会话路由。

凭据只用于选定实例。插件将 DSH 返回的登录 cookie 写入 daemon 用户的 `$PASEO_HOME/plugin-data/paseo-dsh-superagent/connection.json`，默认位于 `~/.paseo` 下，文件权限为 0600。获准连接此 Paseo daemon 的用户共享该连接及其 Router 权限。

## 使用

- 「概览」集中显示待处理工单、系统问题、过去 24 小时流量和执行器负载。点指标或「详情」可进入相应列表。
- 「来源」显示各来源运行状态、被过滤的触发和丢弃的回复。「触发」默认显示已被订阅的线程，可切换到评估中、最近 24 小时或全部，进入线程查看触发时间线。
- 「评估」默认显示接单与续做。可按决定类型筛选、查看理由和匹配规则，从记录进入相关工单或线程。顶部搜索可查找工单、线程和触发。
- 「执行」可按进行中、待处理、执行中、等待新触发和已结束筛选，支持暂停或恢复处理、重试或停止工单。DSH 与 Paseo 同机且能读取工单绑定文件时，可从详情进入执行 Agent。跨机部署应确保绑定属于所选的 Paseo host。
- 「主 Session」按轮显示 DSH 的真实会话记录。点「收到执行请求」查看唤醒 Router 的通知，点带箭头的「已完成，用时 …」展开执行过程，再点活动摘要查看上下文、思考或工具的参数和结果。图片附件在对应消息中按比例显示，工具返回的图片可在工具结果中展开查看。回复支持 Markdown。向上滚动可载入更早的记录。每页向 DSH 请求最多 64 条用户或助手消息，按轮次划分。历史页只携带图片附件的引用和尺寸。图片进入屏幕或接近屏幕上下 200 个布局单位时才下载，同时最多 3 张；离开该范围后，已下载的图片数据在插件查询缓存中保留 1 分钟，方便回滚查看。
- 回复下方会显示 DSH 提交的计划、交付文件和操作建议。点计划标题可展开 Markdown 正文。文件卡片显示名称、说明和可复制的路径，操作建议显示标题、说明和 DSH 记录的状态。HTML 文件的网页预览及建议的执行按钮目前在原版 DSH 中使用。
- 会话定时刷新，支持发送消息、选择模型与推理强度、停止当前回合。运行中发送的消息按队列处理。停止 Router 回合与停止执行工单是两种操作。
- 在 Paseo Desktop 和 Web（含手机浏览器）中，回形针直接打开系统文件选择器。PNG、JPEG、WebP 和 GIF 按图片上传。旧记录中已作为普通文件保存的图片仍显示文件卡片。每次选择最多 12 个文件，每个最多 2 MiB。Paseo 0.17.5 的原生 iOS/Android 插件屏幕 SDK 尚未提供设备文件选择接口，原生端支持文字对话。聊天记录按持久事件刷新。
- 发送请求的回执按实例和请求号保存在 daemon 上。已确认的重复发送复用回执；上次接收状态未知时，先在主会话核对，避免重复派单。
- 面板内的「设置」管理 Superagent 的来源、评估策略、执行器和团队提示词，并显示部署信息。编辑提示词时可以查看主 Session 或执行器的完整预览，再决定是否保存。修改按 DSH 版本号提交，遇到版本冲突时可先复制草稿，再放弃更改并按新版本编辑。
- 来源、策略、评估和执行配置分别保存到所选 DSH 实例。每个子页的「配置历史」显示相关变更。支持同步名单的来源会在「评估 → 在各来源上」提供同步操作。
- 「提示词」按团队约定、内置段落和技能组织正文，可与默认配置或已保存的配置比较。载入历史版本只替换草稿，点击「保存修改」后才生效。同一面板内切换子页会保留该实例的草稿。
- 「部署」读取 DSH 宿主报告的配置权限。实例允许写入时，可以设置提示词最大字符数、研判读取页数和上下文读取时限；清空字段后保存可恢复继承值。状态目录是只读信息。DSH 地址和登录令牌仍在 Paseo 插件设置中管理。

## 本地开发

```sh
npm ci --legacy-peer-deps
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-dsh-superagent
```

`client/` 是跨端页面，`shared/` 定义插件 RPC，`server/` 负责 DSH 通信。`design/` 是使用示例数据的交互设计稿。
