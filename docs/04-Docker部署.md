# Docker Compose 部署手册

> 目标：在阿里云 ECS（2 vCPU / 2 GiB，Ubuntu 22.04 或 Alibaba Cloud Linux 3）上用 Docker Compose 跑起
> `web`（Nginx + Vue 静态文件）、`api`（Express）、`mongo`（MongoDB 7）三个容器。
> 宿主机只暴露 80，API 的 3004 和 MongoDB 的 27017 都不映射到公网。

## 0. 架构

```
浏览器 ──80──> web (nginx:1.27-alpine)
                  ├── /            → /usr/share/nginx/html（Vue dist）
                  └── /api/        → http://api:3004（容器内网）
                                        └── mongodb://mongo:27017（容器内网，带认证）
```

| 服务 | 作用 | 端口 | 健康检查 |
| --- | --- | --- | --- |
| `web` | Nginx 静态站点 + 反向代理 | 宿主机 80 → 容器 80 | `GET /healthz` |
| `api` | Express + Mongoose，16 个 API | 仅容器内 3004 | `GET /api/health` |
| `mongo` | MongoDB 7.0，数据卷持久化 | 仅容器内 27017 | `mongosh` ping |

编排文件：根目录 `docker-compose.yml`；镜像构建：`frontend/Dockerfile`、`server/Dockerfile`；
Nginx：`deploy/nginx.conf`；一键脚本：`deploy.sh`；Windows 上传：`deploy/push-docker.ps1`。

## 1. 服务器准备

- 规格：2 vCPU / 2 GiB / 40 GB ESSD / 1 Mbps 足够；Docker 镜像和构建缓存约占 3–4 GB。
- 镜像：Ubuntu 22.04 LTS 或 Alibaba Cloud Linux 3（都支持 Docker 官方仓库）。
- 安全组：
  - `80/tcp`：对公网开放（只有它需要公网）。
  - `22/tcp`：只对你的出口 IP 开放，用于部署和排障。
  - **不要**开放 3004、27017。
- 免费额度：阿里云“云服务器 ECS 免费试用（个人版）”是 300 元抵扣额度、3 个月有效，2c2g 大约能覆盖 3 个月；
  在 [我的试用](https://usercenter2.aliyun.com/home/myfreetier) 确认资格后开通。试用 ECS 不支持备案，但用公网 IP 访问 80 没问题。

SSH 登录：

```bash
ssh -i ~/.ssh/id_ed25519 root@<公网IP>
```

## 2. 安装 Docker Engine + Compose 插件

### Ubuntu 22.04

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### Alibaba Cloud Linux 3

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

如果和系统自带的 podman 冲突，按提示加 `--allowerasing`；也可以改用阿里云自带的 `docker` 包，
但需要另外安装 compose 插件，优先用上面的官方仓库。

把当前用户加入 docker 组（或全程用 sudo）：

```bash
sudo usermod -aG docker $USER
newgrp docker
docker run --rm hello-world
docker compose version
```

## 3. 镜像加速与 swap（国内 ECS 必做）

Docker Hub 在国内可能很慢甚至超时。到阿里云“容器镜像服务 → 镜像工具 → 镜像加速器”复制专属地址，
写入 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": ["https://<你的ID>.mirror.aliyuncs.com"]
}
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
docker info | grep -A 2 "Registry Mirrors"
```

2 GiB 机器构建前端时建议有 swap，避免 `vue-tsc` / Vite 构建被 OOM：

```bash
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 4. 上传代码

### 方式 A：服务器上 git clone（有远程仓库时）

```bash
sudo mkdir -p /opt/acp && sudo chown $USER:$USER /opt/acp
git clone <仓库地址> /opt/acp
cd /opt/acp
```

当前仓库还没有第一个 commit；建议先在本地 `git init && git add . && git commit` 并推到 GitHub/Gitee，
这样服务器更新只需要 `git pull`。

### 方式 B：Windows 本地推送（没有 git 仓库时）

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\push-docker.ps1 `
  -Server root@<公网IP> `
  -Key $HOME\.ssh\id_ed25519 `
  -RemoteDir /opt/acp
```

脚本会排除 `node_modules`、`dist`、`.git`、`ACP模拟`、截图等，只上传部署必需文件，然后远端执行
`bash deploy.sh`。首次上传约 1–2 MB。

## 5. 配置 `.env`

`deploy.sh` 会在缺少 `.env` 时自动从 `.env.example` 复制，并生成随机 Mongo 密码。也可以手动：

```bash
cd /opt/acp
cp .env.example .env
PASS=$(openssl rand -hex 16)
sed -i "s/^MONGO_ROOT_PASSWORD=.*/MONGO_ROOT_PASSWORD=$PASS/" .env
chmod 600 .env
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `80` | 宿主机映射端口；安全组只放行它 |
| `TZ` | `Asia/Shanghai` | 容器时区 |
| `MONGO_ROOT_USERNAME` | `acpadmin` | Mongo root 用户 |
| `MONGO_ROOT_PASSWORD` | 自动生成 | 只允许字母数字，避免 URI 转义 |
| `MONGODB_DATABASE` | `acp` | 业务库名 |
| `NPM_REGISTRY` | `https://registry.npmjs.org` | 国内可改 `https://registry.npmmirror.com` |

注意：Mongo 的 root 密码只在**数据卷第一次初始化**时生效。之后改 `.env` 里的密码不会改数据库里的密码，
会导致 API 认证失败；要改密码得进容器执行 `db.changeUserPassword`，或删卷重来（会丢数据）。

## 6. 启动

```bash
cd /opt/acp
bash deploy.sh
```

脚本会依次做：

1. 检查 Docker / Compose 可用；
2. 创建 `.env` 并生成随机密码；
3. `docker compose config -q` 校验；
4. `docker compose build --pull`（首次拉取 node / nginx / mongo 基础镜像）；
5. `docker compose up -d --remove-orphans`；
6. 轮询 `docker inspect`，等三个服务全部 `healthy`（最多 240 秒）；
7. 打印 `docker compose ps`，并请求一次 `/api/health`。

期望输出（三个服务都是 `healthy`）：

```text
NAME        IMAGE                COMMAND                  SERVICE   CREATED          STATUS                    PORTS
acp-api-1   acp-api              "node src/server.js"     api       30 seconds ago   Up 25 seconds (healthy)   3004/tcp
acp-mongo-1 mongo:7.0            "docker-entrypoint.s…"   mongo     40 seconds ago   Up 35 seconds (healthy)   27017/tcp
acp-web-1   acp-web              "/docker-entrypoint.…"   web       20 seconds ago   Up 15 seconds (healthy)   0.0.0.0:80->80/tcp
```

### 常用参数

```bash
bash deploy.sh --no-build    # 不重建镜像，只重启
bash deploy.sh --reseed      # 强制重新导入 951 题（SEED_FORCE=1）
bash deploy.sh --down        # 停容器，保留 mongo 数据卷
bash deploy.sh --logs        # 启动后跟随日志
```

## 7. 验证

在服务器上：

```bash
curl -fsS http://127.0.0.1/api/health
curl -fsS http://127.0.0.1/api/meta | head -c 300
docker compose logs --tail=50 api | grep -i seed
```

浏览器打开 `http://<公网IP>/`，走一遍：概览 → 专项练习（提交看解析）→ 全真模拟考（75 题、计时）→ 交卷 →
成绩报告 → 错题本 → 成绩列表。

题库首次启动会自动导入 951 题；以后重启会跳过（`SEED_ON_START=1` + 库内已有数据）。
需要重新导入时执行 `bash deploy.sh --reseed`。

## 8. 日常运维

```bash
docker compose ps                     # 状态（面试截图用这个）
docker compose logs -f --tail=100     # 全部日志
docker compose logs -f api            # 只看后端
docker compose restart api            # 重启后端
docker compose down                   # 停容器，保留数据
```

更新代码：

```bash
cd /opt/acp
git pull                # 或重新执行 push-docker.ps1
bash deploy.sh          # 重新构建 + 滚动启动
```

备份 MongoDB 数据卷：

```bash
cd /opt/acp
docker run --rm -v acp_mongo-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mongo-$(date +%F).tgz -C /data .
```

恢复时先 `docker compose stop api mongo`，把备份解回卷，再 `docker compose start mongo api`。
生产环境更稳妥的做法是 `mongodump`，这里的数据量很小，卷备份足够。

磁盘清理：

```bash
docker image prune -f          # 清理悬空镜像
docker builder prune -f        # 清理构建缓存（会变慢下次构建）
df -h
```

## 9. 安全要点

- 安全组只放行 80；22 只对自己的 IP 开放；3004、27017 不映射宿主机。
- Mongo 开了 root 认证，且只在 compose 内网可达；`.env` 权限 600，不进 git。
- API 已有 helmet、限流、CORS 关闭（同域部署不需要跨域）。
- 镜像使用官方 `node:20-alpine`、`nginx:1.27-alpine`、`mongo:7.0`；上线后定期 `docker compose build --pull` 更新基础镜像。
- 需要 HTTPS 时，在 web 前再加一层负载均衡/证书，或把 80 换成 443 + certbot；当前需求没有域名，先不展开。

## 10. 故障排查

| 现象 | 处理 |
| --- | --- |
| `port 80 is already allocated` | 宿主机 Nginx 占用了 80：`systemctl stop nginx && systemctl disable nginx`，再 `bash deploy.sh` |
| 拉镜像超时 | 配阿里云镜像加速器，重启 docker；或先 `docker pull mongo:7.0` 逐个拉。国内网络也可临时用华为 SWR 公共镜像：`docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/mongo:7.0`，再 `docker tag ... mongo:7.0` |
| `npm ci` 超时 | `.env` 设 `NPM_REGISTRY=https://registry.npmmirror.com`，再 `bash deploy.sh` |
| 构建被 OOM Kill | 确认 2G swap 已开；`export COMPOSE_PARALLEL_LIMIT=1`；分别 `docker compose build api`、`docker compose build web` |
| `mongo` 一直 unhealthy | `docker compose logs mongo`；多为旧数据卷密码不一致，或内存不足 |
| `api` 一直 unhealthy | `docker compose logs api`；看 Mongo 连接串、密码、启动是否 seed 报错 |
| 页面 502 | `api` 没起或 unhealthy；`docker compose ps` + `logs api` |
| 刷新子路由 404 | Nginx 的 `try_files $uri $uri/ /index.html` 没生效，检查 `deploy/nginx.conf` 是否被正确挂进镜像 |
| `permission denied` 连 docker | `sudo usermod -aG docker $USER && newgrp docker`，或 `sudo bash deploy.sh` |

查看容器内部：

```bash
docker compose exec api sh
docker compose exec mongo mongosh -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin
```

## 11. 面试展示建议

1. 终端执行 `docker compose ps`，展示三行 `Up (healthy)`；
2. `docker compose config` 展示端口、健康检查、资源限制；
3. 讲清楚三个点：
   - 只有 web 发布 80，api/mongo 走内部网络；
   - `depends_on: condition: service_healthy` 保证启动顺序；
   - 多阶段构建 + 非 root 运行 + 数据卷 + 日志轮转 + `restart: always`。

这套编排对应的简历关键词：Docker Compose 多容器编排、Nginx 反向代理、MongoDB 持久化、健康检查、
资源限制、一键部署脚本。

## 12. 与宿主机方案的关系

原来的 yum/NVM + PM2 + 宿主机 Nginx 方案已归档到 `deploy/legacy-host/`，仅作回退参考，
不再作为主部署路径。宿主机方案的手册见 `docs/02-部署手册.md`（顶部有归档说明）。

## 13. 本地验证记录（2026-11-14）

- 环境：Windows 11 + Docker Desktop 29.7.2 / Compose v5.5.1，`WEB_PORT=8080`。
- 启动：`docker compose up -d` 后约 20 秒三服务全部 `healthy`（顺序 mongo → api → web）。
- 基础校验：`/api/health` 返回 `db=connected`；`/api/meta` 返回 `bank.total=951`、`explained=299`；
  `/` 与 `/practice` 都返回 200（history 回落生效）。
- 业务校验：新建 75 题试卷 → 提交 2 题（1 单选 + 1 多选）→ `score=3`、`correctCount=2`、
  `unansweredCount=73`；`/api/stats/overview` 累计答题只计 2 题，未答题未被计入。
- 截图：`docs/screenshots/docker-compose-ps.png`（三服务 healthy）、`docs/screenshots/docker-dashboard.png`。
- 说明：本机直连 Docker Hub 受限，`nginx:1.27-alpine` 与 `mongo:7.0` 是用华为 SWR 公共镜像拉取后
  retag 的；ECS 上按 §3 配阿里云镜像加速器即可，`docker-compose.yml` 仍引用官方镜像名。

## 14. 线上部署记录（2026-11-14，阿里云 ECS）

- 实例：`i-bp1dhypbynl61cvjfy1v`，华东1（杭州），2 vCPU / 2 GiB，ESSD Entry 40 GiB，
  公网 `120.55.234.224`，Ubuntu 22.04.5 LTS，100 Mbps 峰值按流量计费。
- 初始化：`deploy/bootstrap-ecs.sh`（2 GiB swap → 阿里云镜像源装 docker-ce / compose-plugin →
  从华为 SWR 预拉 nginx:1.27-alpine、mongo:7.0、node:20-alpine 并 retag；Docker 29.9.3、Compose 5.7.1）。
- 部署：`deploy\push-docker.ps1 -Server root@120.55.234.224 -Key .deploy\acp_ecs`
  （tar 0.93 MB → `/opt/acp` → 自动生成 `.env` → `docker compose build` → `up -d`）。
  因国内拉不到 Docker Hub，构建时使用本地预拉的基础镜像；首次构建 api 约 6 s、web 约 21 s。
- 结果：三个容器均 `Up (healthy)`、`restart=always`；仅发布 `0.0.0.0:80->80/tcp`；
  内存占用约 576 MB / 1736 MB，磁盘 7.3 GB / 40 GB。
- 公网校验：`/api/health` → `{"status":"ok","db":"connected"}`；`/api/meta` → `total=951`、
  `explained=299`；`/` 与 `/practice` 均 200；截图 `public-home.png`、`public-practice.png`、
  `docker-compose-ps.png`。
- 安全组：入方向仅 HTTP 80（`0.0.0.0/0`）与 SSH 22；RDP 3389 已删除；22 建议后续收紧到固定 IP。
- 注意：本机 Edge 对裸 IP 导航会报 `ERR_BLOCKED_BY_CLIENT`（与服务器无关），验收截图通过
  `--host-resolver-rules=MAP acp.internal 120.55.234.224` 访问 `http://acp.internal/` 生成；
  正常浏览器直接访问 `http://120.55.234.224/` 即可。
- 移动端：按 390 × 844 验收，五个主页面 `scrollWidth` 均为 390，无横向滚动；侧栏与答题卡改为抽屉，
  模拟考顶栏精简为计时/退出/交卷。截图见 `docs/screenshots/mobile-*.png`。
- 代码仓库：GitHub 与 Gitee 的 `master` 分支均已推送首版（commit `e95b449` 起）。
