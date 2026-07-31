# 腾讯云部署说明（国内版）

> 目标：在腾讯云轻量服务器跑 Node 版；**根目录 Cloudflare Workers 版保留**，以后还能走 CF。  
> 服务器示例：`81.70.201.192`（2核2G / Ubuntu 22.04）

---

## 分工提醒

| 谁 | 做什么 |
|----|--------|
| 你 | 服务器密码、防火墙、域名转移、备案、填写 `.env` 密钥 |
| 技术/Cursor | 代码、安装、启动服务、排错 |

---

## 一、你先在腾讯云控制台做

1. 确认实例状态为 **运行中**
2. 防火墙 / 防火墙规则放行：
   - **80**（以后域名 HTTP）
   - **443**（以后 HTTPS）
   - **8787**（先用 IP 测试时用；正式上线可再关掉）
3. 准备好登录密码（购买时设置的）

---

## 二、把代码放到服务器

用你电脑的终端（或 Cursor 终端）登录：

```bash
ssh ubuntu@81.70.201.192
```

（若用户名不是 `ubuntu`，用控制台显示的用户名。）

登录后执行：

```bash
sudo apt update
sudo apt install -y git curl build-essential python3

# 安装 Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 拉取代码（把仓库地址换成你的）
cd ~
git clone https://github.com/FZZYTGQ/New_option.git
cd New_option
git checkout deploy/tencent-node

cd server
npm install
cp .env.example .env
nano .env
```

在 `.env` 里填：

```
BIBIGPT_API_TOKEN=你的token
DEEPSEEK_API_KEY=你的key
ADMIN_EMAIL=管理员邮箱
ADMIN_PASSWORD=管理员密码
PORT=8787
HOST=0.0.0.0
```

保存后：

```bash
npm run migrate
npm start
```

本机浏览器访问：

`http://81.70.201.192:8787/login.html`

能打开登录页，说明基础部署成功。用 `Ctrl+C` 可停止前台进程。

---

## 三、开机自启（推荐）

仍在服务器上：

```bash
sudo nano /etc/systemd/system/new-option.service
```

写入（路径按你实际 clone 位置改）：

```ini
[Unit]
Description=New Option Node Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/New_option/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --import ./register-md.js index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable new-option
sudo systemctl start new-option
sudo systemctl status new-option
```

看日志：

```bash
sudo journalctl -u new-option -f
```

---

## 四、域名与备案（你来做，可并行）

1. 把 Cloudflare 上的域名 **转移到腾讯云**
2. 在腾讯云提交 **网站备案**
3. 备案通过前：继续用 `http://IP:8787` 测试
4. 备案通过后：域名解析到 `81.70.201.192`，再装 Nginx + HTTPS（可再让 Cursor 协助）

---

## 五、和 Cloudflare 版的关系

| 路线 | 位置 | 怎么用 |
|------|------|--------|
| Cloudflare 版 | 仓库 `main` + 现有 Workers/D1 | `npm run deploy` / Git 自动部署，照旧 |
| 腾讯云版 | 分支 `deploy/tencent-node` + `server/` | 本文件步骤 |

两套可同时存在。国内主用腾讯云后，Cloudflare 可当备用，不必马上删。

---

## 六、常见问题

**打不开页面**  
- 看防火墙是否放行 8787  
- `sudo systemctl status new-option` 是否 active  
- 安全组/防火墙是否拦了端口  

**登录后提取失败**  
- 检查 `server/.env` 密钥是否填对  
- `sudo journalctl -u new-option -n 100` 看报错  

**想更新代码**

```bash
cd ~/New_option
git pull
cd server
npm install
npm run migrate
sudo systemctl restart new-option
```
