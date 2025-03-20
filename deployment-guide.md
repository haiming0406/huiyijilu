# 会议记录管理系统部署指南

本文档提供了将会议记录管理系统部署到服务器上的详细步骤，使其可以从任何地方访问。

## 目录

1. [准备工作](#准备工作)
2. [选择云服务提供商](#选择云服务提供商)
3. [服务器配置](#服务器配置)
4. [代码部署](#代码部署)
5. [环境变量配置](#环境变量配置)
6. [使用PM2管理应用](#使用pm2管理应用)
7. [配置域名和HTTPS](#配置域名和https)
8. [维护与更新](#维护与更新)

## 准备工作

在开始部署之前，请确保您已经准备好以下内容：

- 完整的项目代码
- 维格表(Vika)账号和API令牌
- 域名（可选，但推荐）

## 选择云服务提供商

您可以选择以下任一云服务提供商：

- **阿里云**：国内访问速度快，提供多种规格的ECS实例
- **腾讯云**：国内访问稳定，轻量应用服务器性价比高
- **华为云**：服务稳定，安全性高
- **AWS**：全球覆盖范围广，服务种类丰富
- **DigitalOcean**：简单易用，价格透明

对于中小型应用，推荐选择配置为2核4G内存的服务器，存储空间至少20GB。

## 服务器配置

### 1. 安装操作系统

推荐使用Ubuntu 20.04 LTS或CentOS 8作为服务器操作系统。

### 2. 安装Node.js环境

```bash
# 使用Ubuntu/Debian系统
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# 或使用CentOS系统
sudo yum install -y curl
curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v  # 应显示v16.x.x
npm -v   # 应显示8.x.x或更高版本
```

### 3. 安装Git

```bash
# Ubuntu/Debian
sudo apt install -y git

# CentOS
sudo yum install -y git
```

### 4. 安装PM2

PM2是一个进程管理工具，用于保持应用程序持续运行。

```bash
sudo npm install -g pm2
```

## 代码部署

### 1. 创建应用目录

```bash
mkdir -p /var/www/meeting-system
cd /var/www/meeting-system
```

### 2. 上传代码

有两种方法可以将代码上传到服务器：

#### 方法一：使用Git（推荐）

1. 首先，将您的代码推送到GitHub、GitLab或其他Git仓库
2. 然后在服务器上克隆仓库：

```bash
git clone https://your-repository-url.git /var/www/meeting-system
cd /var/www/meeting-system
```

#### 方法二：直接上传

使用SFTP工具（如FileZilla）或scp命令将本地文件上传到服务器：

```bash
# 在本地执行
scp -r /path/to/your/local/project/* user@your-server-ip:/var/www/meeting-system/
```

### 3. 安装依赖

```bash
cd /var/www/meeting-system
npm install
```

### 4. 创建uploads目录并设置权限

```bash
mkdir -p uploads
chmod 755 uploads
```

## 环境变量配置

### 1. 创建.env文件

```bash
vi .env
```

添加以下内容（使用您自己的值）：

```
VIKA_TOKEN=your_vika_token
VIKA_DATASHEET_ID=your_datasheet_id
VIKA_VIEW_ID=your_view_id
PORT=3000
```

## 使用PM2管理应用

### 1. 启动应用

```bash
pm2 start server.js --name "meeting-system"
```

### 2. 配置自动启动

```bash
pm2 startup
# 执行命令输出的指令
pm2 save
```

### 3. 查看应用状态

```bash
pm2 status
pm2 logs meeting-system
```

## 配置域名和HTTPS

### 1. 域名解析

1. 购买域名（如阿里云、腾讯云等提供商）
2. 添加A记录，将域名指向您的服务器IP地址

### 2. 安装Nginx

```bash
# Ubuntu/Debian
sudo apt install -y nginx

# CentOS
sudo yum install -y nginx
```

### 3. 配置Nginx反向代理

```bash
sudo vi /etc/nginx/sites-available/meeting-system
```

添加以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /var/www/meeting-system/uploads/;
    }
}
```

创建符号链接并测试配置：

```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/meeting-system /etc/nginx/sites-enabled/

# CentOS
sudo ln -s /etc/nginx/sites-available/meeting-system /etc/nginx/conf.d/meeting-system.conf

sudo nginx -t
sudo systemctl restart nginx
```

### 4. 配置HTTPS（使用Let's Encrypt）

```bash
# 安装Certbot
# Ubuntu/Debian
sudo apt install -y certbot python3-certbot-nginx

# CentOS
sudo yum install -y certbot python3-certbot-nginx

# 获取并安装证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 自动续期证书
sudo systemctl status certbot.timer
```

## 维护与更新

### 1. 更新应用代码

```bash
cd /var/www/meeting-system

# 如果使用Git
git pull

npm install  # 如果有新的依赖
pm2 restart meeting-system
```

### 2. 监控应用

```bash
pm2 monit
```

### 3. 日志管理

```bash
# 查看日志
pm2 logs meeting-system

# 清除日志
pm2 flush
```

### 4. 备份数据

定期备份uploads目录和.env文件：

```bash
# 创建备份目录
mkdir -p /backup/meeting-system

# 备份脚本示例
tar -czf /backup/meeting-system/backup-$(date +%Y%m%d).tar.gz /var/www/meeting-system/uploads /var/www/meeting-system/.env
```

## 故障排除

1. **应用无法启动**：检查日志 `pm2 logs meeting-system`
2. **无法连接到维格表**：验证.env文件中的令牌和ID是否正确
3. **图片上传失败**：检查uploads目录权限
4. **网站无法访问**：检查Nginx配置和防火墙设置

```bash
sudo systemctl status nginx
sudo ufw status  # Ubuntu防火墙
sudo firewall-cmd --list-all  # CentOS防火墙
```

## 安全建议

1. 启用防火墙，只开放必要端口（22, 80, 443）
2. 禁用root SSH登录，使用密钥认证
3. 定期更新系统和软件包
4. 考虑使用CDN服务提高安全性和性能

---

如有任何问题，请随时联系技术支持。祝您部署顺利！