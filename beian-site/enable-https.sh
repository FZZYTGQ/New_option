#!/bin/bash
# 在服务器上执行：bash ~/New_option/beian-site/enable-https.sh
set -euo pipefail

sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

sudo certbot --nginx --non-interactive --agree-tos --redirect \
  --email afterview@163.com \
  -d afterview.cn -d www.afterview.cn

sudo certbot --nginx --non-interactive --agree-tos --redirect \
  --email afterview@163.com \
  -d lab.afterview.cn

sudo nginx -t
sudo systemctl reload nginx

echo
echo "证书已装好。浏览器打开 https://afterview.cn 看左上角是否有锁。"
