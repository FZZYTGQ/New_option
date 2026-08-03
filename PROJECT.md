# 小赵学姐的黑科技 — 项目进度备忘

> 本文档记录产品讨论结论、当前进度与后续计划，方便重启 Cursor 或新开对话时快速接上上下文。  
> 最后更新：2026-08-03

---

## 产品是什么

用户粘贴 **抖音 / B站 / 小红书 / 微信公众号** 的分享文案或链接，系统自动：

1. 提取内容链接  
2. 调用 **BibiGPT** 获取口播逐字稿（视频）或文章正文（公众号）  
3. 调用 **DeepSeek** 按 `summarize_playbook.md` 生成智能总结  

当前阶段为 **内测**：管理员后台开号，按分钟额度计费，暂无付费。

---

## 技术栈与仓库

| 项目 | 说明 |
|------|------|
| 运行时 | Cloudflare Workers（主线） / Node（腾讯云国内版） |
| 静态资源 | `public/` |
| 数据库 | Cloudflare D1（CF 版） / 本地 SQLite（`server/data/`，国内版） |
| 转写 | BibiGPT API（`getSubtitle`） |
| 总结 | DeepSeek API（`deepseek-chat`） |
| 仓库 | https://github.com/FZZYTGQ/New_option.git |
| 部署 | `main` → Cloudflare；`deploy/tencent-node` → 见 `DEPLOY_TENCENT.md` |
| 国内服务器 | 腾讯云轻量 `81.70.201.192`（2核2G） |
| 备案域名 | `afterview.cn`（个人备案：运营笔记站） |
| 备案官网 | `beian-site/`，Nginx 80 端口；见 `BEIAN_SITE.md` |
| 提取工具 | 暂仍用 `http://81.70.201.192:8787`（勿作备案主站） |

**D1 配置（`wrangler.toml`）：**

- binding：`DB`
- database_name：`new-option-db`
- database_id：`377fe925-f923-42bc-80b3-1889d7f30408`

---

## 产品演变（我们聊过的方向）

| 阶段 | 定位 |
|------|------|
| 最初 | 「敬请期待」静态落地页 |
| v1.0 | 无登录的提取工具：转写 + 总结 + 下载/复制 |
| v1.1（当前） | 内测版：登录 + 额度 + 历史记录 + 管理后台 |

**已否定的方向（除非以后改主意）：**

- 不做 TikHub
- 不做多总结模板（固定 `summarize_playbook.md`）
- 不做批量导出
- 不做 Onboarding 引导（1.0）
- 内测不做付费
- 内测阶段用户侧不展示剩余额度

---

## 已上线 / 已完成的功能

### 核心提取

- [x] 四平台链接解析（抖音 / B站 / 小红书 / 微信公众号）
- [x] BibiGPT 口播转写（标题 + 逐字稿）
- [x] 微信公众号文章正文提取（复用 BibiGPT `getSubtitle`，`service=webpage`）
- [x] DeepSeek 智能总结（自定义 playbook；公众号走文章提示词）
- [x] Tab 切换：**内容转写 / 文章正文** | **智能总结**
- [x] 视频元信息（标题、作者、链接、平台）显示在转写 Tab
- [x] 总结 Markdown 渲染（非 raw 文本）
- [x] 下载 `.md`、复制（Toast「已复制到剪贴板」）
- [x] 单条视频最长 **30 分钟**，超长拒绝且不扣费

### 账号与额度（内测）

- [x] 邮箱 + 密码登录（`/login.html`）
- [x] 未登录跳转登录页
- [x] 仅管理员后台开号，无自助注册
- [x] 新用户默认 **30 分钟**额度
- [x] 扣费：`ceil(秒数 / 60)`，最少 1 分钟
- [x] 转写成功即扣费（总结失败也扣）
- [x] 额度用完提示：「额度用完了，请联系小赵学姐增加额度」
- [x] 用户侧 **不显示**剩余额度

### 历史记录

- [x] `/history.html` 历史列表
- [x] 点击标题 **展开/收起**详情（手风琴，非底部详情区）
- [x] 展开后含转写/总结 Tab、下载、复制
- [x] 懒加载详情（首次展开才请求 API）

### 管理后台（`/admin.html`，仅 admin）

- [x] 概览：用户数、今日提取、消耗统计、最近记录
- [x] 用户管理：查看列表、禁用/启用
- [x] **自定义分钟数**增加额度（非固定 +30/+60）
- [x] **重置密码**（弹窗输入新密码，重置后清除该用户 session）
- [x] 使用记录：按邮箱筛选
- [x] 创建用户（邮箱 + 初始密码 + 初始额度）
- [x] 最近记录表格优化（时间/扣费/状态单行显示）

### 部署与运维

- [x] GitHub → Cloudflare 自动部署
- [x] D1 远程迁移已执行（`0001_init.sql`）
- [x] 域名验证文件：`public/ed3e179b58ddfc55e289045b2e93a6d5.txt`
- [x] UI：品牌图 `pic3.png`，背景色 `#FBFBFB`

### 代码已有但未启用

- 一键分享（`/s/:id`）：后端 + 前端按钮逻辑在，但 **KV 未配置**，按钮默认隐藏

---

## 已达成共识的业务规则

| 规则 | 结论 |
|------|------|
| 注册 | 仅管理员开号 |
| 默认额度 | 30 分钟/人 |
| 视频上限 | 30 分钟 |
| 扣费时机 | 转写成功即扣 |
| 总结失败 | 仍扣费，历史保留转写 |
| 用户看额度 | 不展示 |
| 付费 | 内测不做 |

---

## 数据库表（D1）

`migrations/0001_init.sql`：

- `users` — 账号、密码哈希、额度、角色
- `sessions` — 登录会话
- `history` — 提取历史
- `usage_logs` — 额度变动日志

---

## 环境变量 / Secrets

**本地：** `.dev.vars`（不进 git）

```
BIBIGPT_API_TOKEN=...
DEEPSEEK_API_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

**线上：** Cloudflare Workers Secrets（同名）

首次部署时，若数据库无该邮箱，会用 `ADMIN_EMAIL` + `ADMIN_PASSWORD` 自动创建 admin 账号。  
注意：之后改 Secret **不会**自动更新库里已有管理员的密码，需在后台重置或改库。

---

## 日常开发与部署

### 本地开发

```bash
npm install
npm run db:migrate:local   # 首次或删过 .wrangler 后必跑
npm run dev
```

访问：`http://localhost:8787/login.html`

> 本地 D1 与线上 D1 是两套库。只跑 `db:migrate:remote` 不能解决本地 `no such table: users`。

### 部署到 Cloudflare（日常）

```bash
git add .
git commit -m "描述改动"
git push origin main
```

等 Cloudflare 构建成功即可。一般 **不需要**再手动 `npm run deploy`。

### 仅当新增数据库迁移文件时

```bash
npm run db:migrate:remote
```

然后再 push 或 `npm run deploy`。

### 本机直接部署（可选）

```bash
npx wrangler login    # 首次
npm run deploy
```

---

## 页面路由

| 路径 | 说明 |
|------|------|
| `/login.html` | 登录 |
| `/` | 提取首页（需登录） |
| `/history.html` | 历史记录 |
| `/admin.html` | 管理后台（仅 admin） |
| `/s/:id` | 分享页（KV 未启用） |

---

## 关键文件

```
New_option/
├── public/              # 前端静态页
│   ├── index.html       # 提取首页
│   ├── history.html     # 历史记录
│   ├── admin.html       # 管理后台
│   └── ...
├── src/                 # Worker 后端
│   ├── index.js         # 路由入口
│   ├── auth.js          # 密码哈希、Session
│   ├── db.js            # 额度、历史
│   └── routes/          # API 路由
├── migrations/          # D1 迁移
├── summarize_playbook.md
├── wrangler.toml
├── .dev.vars            # 本地密钥（gitignore）
└── README.md            # 技术说明
```

---

## 后续计划（讨论过，尚未做）

### 第一波：内测打磨（优先）

| # | 功能 | 说明 |
|---|------|------|
| A1 | 错误提示分类 | 链接无效 / 超 30 分钟 / 额度不足 / API 失败等分开提示 |
| A2 | 总结失败兜底 | 明确提示「转写已完成，总结失败」 |
| A5 | 使用说明 + 隐私页 | 内测发给用户更正规 |

### 第二波：省钱 + 防滥用（有真实用量后）

| # | 功能 | 说明 |
|---|------|------|
| B1 | 同链接结果缓存 | 避免重复调 BibiGPT，需定：缓存多久、是否仍扣额度 |
| B2 | 限流 | 防刷、防连点 |
| B3 | 重新总结 | 历史里仅重跑总结，不重复转写 |
| B4 | 管理员退额度 | 处理误扣 |

### 第三波：体验 + 商业化准备

| # | 功能 | 说明 |
|---|------|------|
| C1 | 一键分享 | 恢复 KV，生成 `/s/xxx` 只读链接 |
| C2 | 移动端优化 | 微信粘贴场景，计划 1.1 |
| C3 | 用户自助改密 | 管理员重置已有，用户自助改密未做 |
| C5 | 付费套餐 | 售卖前再做 |

### 明确搁置

- 批量导出  
- 多总结模板  
- Onboarding  
- 用户侧显示剩余额度  
- 邮件找回密码（内测用户少，管理员重置即可）

---

## 已知问题 / 注意事项

1. **API Key 安全**：若曾在聊天中粘贴过 Key，建议在 BibiGPT / DeepSeek 后台轮换。  
2. **管理员密码**：存在 D1 的哈希里，改 Cloudflare Secret 不会自动同步已创建的管理员密码。  
3. **分享功能**：代码在，需配置 KV 才能启用。  
4. **本地 vs 线上数据库**：开发时注意区分，本地报错 `no such table` 时跑 `npm run db:migrate:local`。

---

## 新开对话时怎么说

在 Cursor 新开对话，可以直接发：

> 请先阅读 `PROJECT.md` 和当前代码，继续「小赵学姐的黑科技」项目的开发。

或从历史对话列表点回本次会话继续聊。

---

## 进度一览

```
【内测闭环】  登录 → 提取(≤30min) → 扣额度 → 历史记录 → 管理后台
【代码完成度】  核心功能 + 内测系统 ≈ 90%
【线上状态】    内测版已部署（登录页正常、D1 已迁移）
【下一步建议】  内测跑通 → A1/A2 错误体验 → 视用量做 B1/B2
```
