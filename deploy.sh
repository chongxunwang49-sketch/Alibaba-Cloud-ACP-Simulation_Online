#!/usr/bin/env bash
# 阿里云 ACP 模拟考试：Docker Compose 一键部署
# 用法：
#   bash deploy.sh                 # 构建并启动，等待 3 个服务 healthy
#   bash deploy.sh --no-build      # 不重新构建，直接启动
#   bash deploy.sh --reseed        # 强制重新导入 951 题
#   bash deploy.sh --down          # 停止并移除容器（保留数据卷）
#   bash deploy.sh --logs          # 启动后跟随日志
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DO_BUILD=1
DO_DOWN=0
DO_LOGS=0
RESEED=0

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --down) DO_DOWN=1 ;;
    --logs) DO_LOGS=1 ;;
    --reseed) RESEED=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$arg（用 --help 查看用法）" >&2; exit 2 ;;
  esac
done

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "[error] 未找到 docker compose；请先安装 Docker Engine + Compose 插件" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[error] Docker 守护进程不可用（未启动或当前用户无权限）" >&2
  echo "        可尝试：sudo bash deploy.sh，或把用户加入 docker 组后重新登录" >&2
  exit 1
fi

if [ "$DO_DOWN" = 1 ]; then
  $COMPOSE down
  echo "[ok] 容器已停止（MongoDB 数据卷保留）"
  exit 0
fi

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "[error] 缺少 .env.example" >&2
    exit 1
  fi
  cp .env.example .env
  chmod 600 .env
  echo "[env] 已从 .env.example 创建 .env"
fi

# 兼容 Windows 编辑器带进来的 CRLF
sed -i 's/\r$//' .env

read_env() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' .env
}

gen_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

if ! grep -q '^MONGO_ROOT_PASSWORD=' .env || grep -q '^MONGO_ROOT_PASSWORD=change-me-please' .env; then
  PASS="$(gen_password)"
  if grep -q '^MONGO_ROOT_PASSWORD=' .env; then
    sed -i "s|^MONGO_ROOT_PASSWORD=.*|MONGO_ROOT_PASSWORD=${PASS}|" .env
  else
    printf '\nMONGO_ROOT_PASSWORD=%s\n' "$PASS" >> .env
  fi
  echo "[env] 已生成随机 MONGO_ROOT_PASSWORD（保存在 .env，权限 600）"
fi

PASS="$(read_env MONGO_ROOT_PASSWORD)"
if [ "${#PASS}" -lt 12 ]; then
  echo "[error] MONGO_ROOT_PASSWORD 至少 12 位" >&2
  exit 1
fi
case "$PASS" in
  *[!A-Za-z0-9]*)
    echo "[error] MONGO_ROOT_PASSWORD 只能包含字母和数字（避免 URI 转义问题）" >&2
    exit 1
    ;;
esac

WEB_PORT="$(read_env WEB_PORT)"
WEB_PORT="${WEB_PORT:-80}"

if [ "$WEB_PORT" = "80" ] && command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | awk 'NR > 1 { print $4 }' | grep -qE '(:80)$'; then
    if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ':80->80/tcp'; then
      echo "[error] 宿主机 80 端口已被占用（多半是系统 Nginx）" >&2
      echo "        先停掉宿主机 Nginx：systemctl stop nginx && systemctl disable nginx" >&2
      exit 1
    fi
  fi
fi

export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
export SEED_FORCE="$RESEED"

echo "[compose] 校验配置..."
$COMPOSE config -q

if [ "$DO_BUILD" = 1 ]; then
  echo "[build] 构建 web / api 镜像（首次会拉取 node、nginx、mongo 基础镜像）..."
  # 国内机器常连不上 Docker Hub；基础镜像可由 bootstrap-ecs.sh 预拉并用本地 tag。
  # 需要强制更新基础镜像时：PULL_BASE=1 bash deploy.sh
  if [ "${PULL_BASE:-0}" = "1" ]; then
    $COMPOSE build --pull
  else
    $COMPOSE build
  fi
fi

echo "[up] 启动容器..."
$COMPOSE up -d --remove-orphans

wait_healthy() {
  local deadline=$((SECONDS + 240))
  local ids id status all
  while [ "$SECONDS" -lt "$deadline" ]; do
    ids="$($COMPOSE ps -q 2>/dev/null || true)"
    if [ -n "$ids" ]; then
      all=1
      for id in $ids; do
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
        if [ "$status" != "healthy" ]; then
          all=0
        fi
      done
      if [ "$all" = 1 ]; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

echo "[wait] 等待 mongo / api / web 全部 healthy（最多 240 秒）..."
if ! wait_healthy; then
  echo "[error] 服务未在 240 秒内全部 healthy，最近日志：" >&2
  $COMPOSE ps || true
  $COMPOSE logs --tail=120 --no-color || true
  exit 1
fi

echo
$COMPOSE ps

if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 10); do
    if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null 2>&1; then
      echo "[ok] API 健康检查通过：http://127.0.0.1:${WEB_PORT}/api/health"
      break
    fi
    sleep 2
  done
fi

echo
echo "[done] 部署完成：http://<服务器公网IP>:${WEB_PORT}/"
echo "       查看状态：docker compose ps"
echo "       查看日志：docker compose logs -f --tail=100"
echo "       停止服务：bash deploy.sh --down"

if [ "$DO_LOGS" = 1 ]; then
  echo
  $COMPOSE logs -f --tail=100
fi
