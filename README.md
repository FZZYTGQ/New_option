# New Option

小赵学姐的黑科技 — 粘贴抖音 / B站 / 小红书分享内容，自动提取口播逐字稿，并用 DeepSeek 按自定义规范生成 AI 总结。

## 功能

- 管理员后台开号，邮箱 + 密码登录
- 每账号默认 30 分钟额度，按视频时长扣减
- BibiGPT `getSubtitle` 提取口播逐字稿
- DeepSeek 按 `summarize_playbook.md` 规范生成总结
- 历史记录回看
- 管理后台：创建用户、加额度、查看使用记录
- 下载 Markdown、复制内容

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置 `.dev.vars`

```bash
cp .dev.vars.example .dev.vars
```

需要填写：

```
BIBIGPT_API_TOKEN=...
DEEPSEEK_API_KEY=...
ADMIN_EMAIL=你的管理员邮箱
ADMIN_PASSWORD=你的管理员密码
```

首次启动时，如果数据库里还没有该邮箱，会自动创建 **admin** 账号。

3. 初始化本地数据库

```bash
npm run db:migrate:local
```

4. 启动

```bash
npm run dev
```

访问 `http://localhost:8787/login.html` 登录。

## 部署到 Cloudflare

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create new-option-db
```

把返回的 `database_id` 填进 `wrangler.toml` 的 `[[d1_databases]]` 配置，替换 `local-dev-placeholder`。

### 2. 应用远程数据库迁移

```bash
npm run db:migrate:remote
```

### 3. 配置 Secrets

```bash
npx wrangler secret put BIBIGPT_API_TOKEN
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
```

### 4. 部署

```bash
npm run deploy
```

如果使用 Cloudflare Git 自动部署，建议在构建命令中加入：

```bash
npm install && npm run db:migrate:remote && npm run deploy
```

## 页面

| 路径 | 说明 |
|------|------|
| `/login.html` | 登录 |
| `/` | 提取首页（需登录） |
| `/detail.html?id=` | 记录详情（转写 / 总结） |
| `/history.html` | 历史记录 |
| `/admin.html` | 管理后台（仅 admin） |

## 业务规则

- 新用户默认额度：30 分钟
- 扣费：`ceil(视频秒数 / 60)`，最少 1 分钟
- 超过 30 分钟视频：拒绝，不扣费
- 转写成功但总结失败：仍扣费，历史里保留转写
- 额度用完提示：`额度用完了，请联系小赵学姐增加额度`

## 技术栈

- Cloudflare Workers + D1 + Static Assets
- BibiGPT API（字幕/转写）
- DeepSeek API（总结）
