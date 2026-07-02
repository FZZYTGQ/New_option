# New Option

小赵学姐的黑科技 — 粘贴抖音 / B站 / 小红书分享内容，自动提取口播逐字稿，并用 DeepSeek 按自定义规范生成 AI 总结。

## 功能

- 从整段分享文案中自动识别视频链接（可含标题、口令等杂项文字）
- BibiGPT `getSubtitle` 提取口播逐字稿
- DeepSeek 按 `summarize_playbook.md` 规范生成总结
- 下载 Markdown 文件
- 一键分享（Web Share API，不支持时回退为复制）

## 项目结构

```
.
├── public/                 # 前端页面
├── src/                    # Cloudflare Worker 后端
│   ├── index.js
│   ├── extractUrl.js
│   ├── bibigpt.js
│   ├── deepseek.js
│   └── summarize_playbook.md
├── summarize_playbook.md   # 总结规范源文件
├── wrangler.toml
└── package.json
```

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置密钥（复制示例后填入真实值）

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 需要包含：

```
BIBIGPT_API_TOKEN=你的bibigpt_token
DEEPSEEK_API_KEY=你的deepseek_key
```

3. 启动本地预览

```bash
npm run dev
```

## 部署到 Cloudflare

1. 在 Cloudflare 项目中配置 Secrets（不要写进代码或 Git）：

```bash
npx wrangler secret put BIBIGPT_API_TOKEN
npx wrangler secret put DEEPSEEK_API_KEY
```

2. 部署

```bash
npm run deploy
```

## API

### `POST /api/extract`

请求体：

```json
{
  "input": "整段分享文案或链接"
}
```

成功响应：

```json
{
  "success": true,
  "data": {
    "platform": "douyin",
    "videoUrl": "https://...",
    "title": "视频标题",
    "author": "作者",
    "transcript": "口播逐字稿...",
    "summary": "AI 总结..."
  }
}
```

## 技术栈

- Cloudflare Workers + Static Assets
- BibiGPT API（字幕/转写）
- DeepSeek API（总结）
