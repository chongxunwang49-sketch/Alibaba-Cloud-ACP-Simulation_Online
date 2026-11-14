#!/usr/bin/env bash
# One-time ECS bootstrap: swap + Docker Engine + Compose plugin + base images.
# Safe to re-run (idempotent).
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
log() { echo "[bootstrap] $*"; }

if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  log "creating 2G swap"
  if ! fallocate -l 2G /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null 2>&1; then
  log "installing docker-ce from mirrors.aliyun.com"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  fi
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi

systemctl enable --now docker >/dev/null 2>&1 || true
log "docker: $(docker --version)"
log "compose: $(docker compose version --short 2>/dev/null || echo missing)"

pull_tag() {
  src="$1"; dst="$2"
  if docker image inspect "$dst" >/dev/null 2>&1; then
    log "have $dst"
    return 0
  fi
  log "pulling $dst via SWR"
  if docker pull -q "$src" >/dev/null 2>&1; then
    docker tag "$src" "$dst"
    log "tagged $dst"
  else
    log "WARN pull failed: $src (build will try Docker Hub)"
  fi
}

pull_tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/nginx:1.27-alpine nginx:1.27-alpine
pull_tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/mongo:7.0 mongo:7.0
pull_tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine node:20-alpine

log "done: $(free -m | awk '/Mem:/{print $2"MB RAM"}') + $(swapon --show=SIZE --noheadings 2>/dev/null | tr -d ' ' || echo 'no swap')"
