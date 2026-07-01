# New Option

敬请期待静态页面，通过 Cloudflare Workers 部署。

## 项目结构

```
.
├── public/
│   ├── Frame 16.png   # 页面主图
│   └── index.html     # 入口页面
├── wrangler.toml      # Cloudflare Workers 配置
└── package.json
```

## 本地开发

安装依赖：

```bash
npm install
```

启动本地预览：

```bash
npm run dev
```

## 部署

```bash
npm run deploy
```

首次部署需要登录 Cloudflare 账号，按终端提示完成授权即可。

部署成功后，Wrangler 会输出访问地址（`*.workers.dev`）。如需绑定自定义域名，可在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 中配置。

## 技术栈

- 静态 HTML / CSS
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)（静态资源托管）
