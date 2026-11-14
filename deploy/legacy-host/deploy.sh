#!/usr/bin/env bash
# 阿里云 ACP 模拟考试 —— 一键部署脚本
#
# 两种用法：
#   1) 在本地仓库根目录执行（Git Bash / WSL / macOS / Linux），推送到服务器并远程部署：
#        DEPLOY_HOST=root@47.xx.xx.xx bash deploy/deploy.sh
#      可选：DEPLOY_SSH_KEY=~/.ssh/acp_ed25519（默认走 ssh-agent / ~/.ssh/config）
#
#   2) 直接把仓库放到服务器（git clone / 手工上传）后，在服务器上执行：
#        bash deploy/deploy.sh
#
# 可用环境变量：
#   DEPLOY_HOST      远端 user@host，存在则进入“上传+远程部署”模式
#   DEPLOY_DIR       服务器上的代码目录，默认 /opt/acp
#   WEB_ROOT         前端静态目录，默认 /var/www/acp/dist
#   WEB_DIST         本地前端产物目录；不指定则自动找 frontend/dist / dist / web/dist / ACP模拟/dist
#   HEALTH_URL       健康检查地址，默认 http://127.0.0.1:3004/api/health
#   SKIP_NGINX=1     跳过 Nginx 配置与 reload
#   SKIP_WEB=1       跳过前端发布
#
# 前置条件：服务器已装 Node 16.20+、MongoDB、Nginx、PM2（见 docs/02-部署手册.md）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY_DIR="${DEPLOY_DIR:-/opt/acp}"
WEB_ROOT="${WEB_ROOT:-/var/www/acp/dist}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3004/api/health}"
SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
# root 直接执行时不需要 sudo（部分精简镜像没装 sudo）
SUDO=""
if [[ "$(id -u)" != "0" ]]; then SUDO="sudo"; fi

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 本地模式
if [[ -n "${DEPLOY_HOST:-}" ]]; then
  command -v tar >/dev/null 2>&1 || die "本地缺少 tar"
  command -v ssh >/dev/null 2>&1 || die "本地缺少 ssh"
  command -v scp >/dev/null 2>&1 || die "本地缺少 scp"
  [[ -n "${DEPLOY_SSH_KEY:-}" ]] && SSH_OPTS+=(-i "${DEPLOY_SSH_KEY/#\~/$HOME}")

  STAMP="$(date +%Y%m%d%H%M%S)"
  TARBALL="acp-deploy-$STAMP.tgz"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  log "打包仓库（排除 node_modules / 密钥 / 构建残留）"
  tar -czf "$TMP_DIR/$TARBALL" -C "$APP_ROOT" \
    --exclude='*node_modules*' \
    --exclude='server/.env' \
    --exclude='.git' \
    --exclude='.git/*' \
    --exclude='*/.git' \
    --exclude='*/.git/*' \
    --exclude='*edge-profile*' \
    --exclude='*_build/shots*' \
    --exclude='*__pycache__*' \
    --exclude='*.log' \
    .

  log "上传到 $DEPLOY_HOST:/tmp/$TARBALL"
  scp "${SSH_OPTS[@]}" "$TMP_DIR/$TARBALL" "$DEPLOY_HOST:/tmp/$TARBALL"

  log "远程解压到 $DEPLOY_DIR 并执行部署"
  REMOTE_ENV="DEPLOY_DIR='$DEPLOY_DIR' WEB_ROOT='$WEB_ROOT' HEALTH_URL='$HEALTH_URL'"
  [[ -n "${SKIP_NGINX:-}" ]] && REMOTE_ENV="$REMOTE_ENV SKIP_NGINX='$SKIP_NGINX'"
  [[ -n "${SKIP_WEB:-}" ]] && REMOTE_ENV="$REMOTE_ENV SKIP_WEB='$SKIP_WEB'"
  ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" \
    "set -e; mkdir -p '$DEPLOY_DIR'; tar -xzf '/tmp/$TARBALL' -C '$DEPLOY_DIR'; rm -f '/tmp/$TARBALL'; $REMOTE_ENV bash '$DEPLOY_DIR/deploy/deploy.sh'"

  log "远端部署完成"
  exit 0
fi

# ---------------------------------------------------------------- 服务器模式
log "检查运行环境"
command -v node >/dev/null 2>&1 || die "未安装 Node.js"
command -v npm >/dev/null 2>&1 || die "未安装 npm"
command -v pm2 >/dev/null 2>&1 || die "未安装 PM2：npm i -g pm2"
node -v
npm -v

[[ -f "$APP_ROOT/server/package.json" ]] || die "找不到 $APP_ROOT/server/package.json"

log "安装后端依赖（production）"
cd "$APP_ROOT/server"
if [[ ! -f .env ]]; then
  cp .env.example .env
  log "已生成 server/.env（默认 mongodb://127.0.0.1:27017/acp），请按需修改后重跑"
fi
[[ -f data/questions.array.json ]] || die "缺少 data/questions.array.json，请先在本地执行 npm run export:bank 并提交"
npm ci --omit=dev --no-audit --no-fund

log "启动 / 重载 PM2"
pm2 startOrReload "$APP_ROOT/deploy/ecosystem.config.js" --update-env
pm2 save

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  if [[ -z "${WEB_DIST:-}" ]]; then
    for candidate in "$APP_ROOT/frontend/dist" "$APP_ROOT/dist" "$APP_ROOT/web/dist" "$APP_ROOT/ACP模拟/dist"; do
      if [[ -d "$candidate" ]]; then WEB_DIST="$candidate"; break; fi
    done
  fi

  if [[ -n "${WEB_DIST:-}" && -d "$WEB_DIST" ]]; then
    log "发布前端：$WEB_DIST -> $WEB_ROOT"
    $SUDO mkdir -p "$WEB_ROOT"
    if command -v rsync >/dev/null 2>&1; then
      $SUDO rsync -a --delete "$WEB_DIST/" "$WEB_ROOT/"
    else
      $SUDO rm -rf "${WEB_ROOT:?}/"*
      $SUDO cp -r "$WEB_DIST/." "$WEB_ROOT/"
    fi
  else
    log "未发现前端产物（dist/），跳过前端发布；后端部署不受影响"
  fi
fi

if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
  if [[ -d /etc/nginx/conf.d ]]; then
    log "安装 Nginx 站点配置"
    # 系统自带的 default.conf 占用 80 端口 default_server，先备份移走
    if [[ -f /etc/nginx/conf.d/default.conf ]]; then
      $SUDO mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak
    fi
    $SUDO install -m 644 "$APP_ROOT/deploy/nginx.conf" /etc/nginx/conf.d/acp.conf
    $SUDO nginx -t
    $SUDO systemctl reload nginx
  else
    log "未发现 /etc/nginx/conf.d，跳过 Nginx；可手工复制 deploy/nginx.conf"
  fi
fi

log "健康检查"
for attempt in $(seq 1 15); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "15" ]]; then
    die "健康检查失败：$HEALTH_URL（看 pm2 logs acp-api 与 Mongo 状态）"
  fi
  sleep 2
done

curl -fsS "$HEALTH_URL"
printf '\n'

log "部署完成"
pm2 status acp-api
