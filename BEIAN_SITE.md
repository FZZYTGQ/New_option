# AfterView 备案官网部署

域名 `afterview.cn` 对外展示 **运营笔记站**（备案用），  
提取工具用：`http://lab.afterview.cn`（Nginx 反代到本机 8787）。

---

## 你需要做的

### 1. 腾讯云防火墙放行 80

轻量服务器 → 防火墙 → 添加规则：

- 协议：TCP  
- 端口：`80`  
- 策略：允许  

### 2. 服务器上更新代码并安装 Nginx

SSH 登录后粘贴：

```bash
cd ~/New_option
git pull
sudo apt update
sudo apt install -y nginx
sudo cp ~/New_option/beian-site/nginx-afterview.conf /etc/nginx/sites-available/afterview
sudo ln -sf /etc/nginx/sites-available/afterview /etc/nginx/sites-enabled/afterview
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager
```

### 3. 浏览器验证

打开：

- http://afterview.cn  
- http://www.afterview.cn  

应看到「AfterView / 运营笔记」页面，而不是登录提取页。

提取工具验证：

- http://lab.afterview.cn/login.html  
- 主站仍应是笔记页：http://afterview.cn 

---

## 备案通过后

1. 编辑 `beian-site/index.html` 页脚，填入真实备案号并打开链接  
2. `git pull` 后一般无需重启 Nginx（静态文件）；若改了 nginx 配置再 `sudo systemctl reload nginx`

## 修改联系邮箱

编辑服务器上的：

`~/New_option/beian-site/index.html`

里的 `mailto:` 与显示邮箱，保存后刷新页面即可。
