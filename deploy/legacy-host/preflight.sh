#!/usr/bin/env bash
# 阿里云 ACP 模拟考试 —— 上线前服务器自检（只读，不改任何配置）
#
# 用法（在服务器上，任意目录）：
#   bash deploy/preflight.sh
#
# 输出 [OK] / [WARN] / [FAIL] 三档；存在 FAIL 时退出码为 1。
# 建议在首次部署前、以及每次换系统/升级 Node/Mongo 后各跑一次。

set -uo pipefail

PASS=0
WARN=0
FAIL=0

section() { printf '\n== %s ==\n' "$*"; }
ok()   { printf '  [OK]   %s\n' "$*"; PASS=$((PASS + 1)); }
warn() { printf '  [WARN] %s\n' "$*"; WARN=$((WARN + 1)); }
bad()  { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL + 1)); }

have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- 系统
section "系统"
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "系统：${PRETTY_NAME:-unknown}（${VERSION_ID:-?}，$(uname -m)）"
  case "${ID:-}:${VERSION_ID:-}" in
    centos:7*)          ok "识别为 CentOS 7：Node 需用 glibc-217 构建（22.20.0），MongoDB 用 4.4" ;;
    alinux:3*|rocky:8*|rocky:9*|centos:8*|centos:9*) ok "识别为 RHEL 8/9 兼容系统：可直接用 Node 22 官方包" ;;
    ubuntu:2[2-9].*|ubuntu:3[0-9].*) ok "识别为 Ubuntu：可用 Node 22 官方包 + MongoDB 7.0" ;;
    *) warn "未识别的系统组合 ${ID:-?} ${VERSION_ID:-?}，请按 docs/02-部署手册.md 选择 Node/Mongo 版本" ;;
  esac
else
  warn "缺少 /etc/os-release，无法判断发行版"
fi

kernel="$(uname -r)"
ok "内核：$kernel"
if getenforce >/dev/null 2>&1; then
  selinux="$(getenforce)"
  if [[ "$selinux" == "Enforcing" ]]; then
    warn "SELinux=Enforcing：Nginx 反代/上传目录可能需要 setsebool 或 chcon"
  else
    ok "SELinux=$selinux"
  fi
fi

# ---------------------------------------------------------------- 资源
section "内存 / 磁盘 / CPU"
mem_mb="$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)"
swap_mb="$(awk '/SwapTotal/{printf "%d", $2/1024}' /proc/meminfo)"
cores="$(nproc 2>/dev/null || echo '?')"
ok "CPU：${cores} 核，内存：${mem_mb} MB，Swap：${swap_mb} MB"
if [[ "$mem_mb" -lt 1800 ]]; then
  bad "内存小于 1.8 GB，Node + MongoDB 同机会很紧张"
elif [[ "$mem_mb" -lt 3500 && "$swap_mb" -lt 1024 ]]; then
  warn "2 GiB 内存建议加 2 GB swap（见手册第 1 节）"
fi

for dir in /opt /var; do
  if [[ -d "$dir" ]]; then
    avail="$(df -Pm "$dir" 2>/dev/null | awk 'NR==2{print $4}')"
    if [[ -n "${avail:-}" && "$avail" -lt 2048 ]]; then
      warn "$dir 剩余 ${avail} MB，建议至少 2 GB"
    else
      ok "$dir 剩余 ${avail:-?} MB"
    fi
  fi
done

# ---------------------------------------------------------------- 运行时
section "运行时"
if have node; then
  node_ver="$(node -v)"
  node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [[ "$node_major" -lt 16 ]]; then
    bad "Node $node_ver 过旧，后端要求 >= 16.20.1"
  elif [[ "$node_major" -eq 16 ]]; then
    ok "Node $node_ver（可用，但 16 已 EOL）"
  else
    ok "Node $node_ver"
  fi
else
  bad "未安装 Node.js"
fi

have npm  && ok "npm $(npm -v 2>/dev/null)"                                    || bad "未安装 npm"
have pm2  && ok "PM2 $(pm2 -v 2>/dev/null | tail -1)"                          || bad "未安装 PM2（npm i -g pm2@5）"
have nginx && ok "Nginx $(nginx -v 2>&1 | sed 's#.*/##')"                      || bad "未安装 Nginx"
have curl && ok "curl 可用"                                                    || warn "缺少 curl，部署脚本健康检查会失败"
have tar  && ok "tar 可用"                                                     || warn "缺少 tar，本地推送部署会失败"
have rsync && ok "rsync 可用"                                                  || warn "缺少 rsync，部署脚本会用 cp 回退"
have git  && ok "git 可用"                                                     || warn "缺少 git（从仓库部署时需要）"

if [[ "$(id -u)" != "0" ]] && ! have sudo; then
  bad "当前非 root 且没有 sudo，无法安装 Nginx 配置/发布静态文件"
fi

# ---------------------------------------------------------------- MongoDB
section "MongoDB"
if have mongod; then
  ok "mongod $(mongod --version 2>/dev/null | head -1 | sed 's/^db version //')"
else
  bad "未安装 mongod"
fi

if have mongosh; then
  MONGO_CLI="mongosh"
elif have mongo; then
  MONGO_CLI="mongo"
else
  MONGO_CLI=""
fi

if [[ -n "$MONGO_CLI" ]]; then
  ping="$("$MONGO_CLI" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | tail -1)"
  if [[ "$ping" == "1" ]]; then
    ok "MongoDB 可连接（$MONGO_CLI）"
    count="$("$MONGO_CLI" --quiet --eval 'db.getSiblingDB("acp").questions.countDocuments({})' 2>/dev/null | tail -1)"
    if [[ "$count" == "951" ]]; then
      ok "acp.questions 已有 951 题"
    else
      warn "acp.questions 当前 ${count:-0} 题（首次启动会自动导入）"
    fi
  else
    bad "MongoDB 连接失败（systemctl status mongod）"
  fi
else
  warn "没有 mongosh/mongo 客户端，跳过连接检查"
fi

if systemctl list-unit-files 2>/dev/null | grep -q '^mongod\.service'; then
  if systemctl is-active --quiet mongod; then
    ok "mongod 服务运行中"
  else
    bad "mongod 服务未运行（systemctl enable --now mongod）"
  fi
fi

conf=/etc/mongod.conf
if [[ -f "$conf" ]]; then
  if grep -Eq '^\s*bindIp:\s*(127\.0\.0\.1|localhost)\s*$' "$conf"; then
    ok "mongod 仅监听 127.0.0.1"
  else
    warn "mongod bindIp 不是 127.0.0.1，请确认 27017 未暴露公网"
  fi
  if grep -Eq 'cacheSizeGB' "$conf"; then
    ok "已设置 WiredTiger cacheSizeGB"
  else
    warn "未设置 cacheSizeGB，2 GiB 机器建议 0.5（见手册第 3 节）"
  fi
fi

# ---------------------------------------------------------------- 端口
section "端口"
ss_out="$(ss -lntH 2>/dev/null || true)"
if [[ -n "$ss_out" ]]; then
  listen_addrs="$(echo "$ss_out" | awk '{print $4}')"

  if echo "$listen_addrs" | grep -Eq '(^|:)80$'; then
    ok "80 已监听"
  else
    bad "80 未监听（Nginx 未启动或配置未加载）"
  fi

  if echo "$listen_addrs" | grep -Eq '(^|:)3004$'; then
    ok "3004 已监听（应只由安全组/防火墙限制外部访问）"
  else
    warn "3004 未监听（后端未启动）"
  fi

  mongo_addrs="$(echo "$listen_addrs" | grep ':27017$' || true)"
  if [[ -n "$mongo_addrs" ]]; then
    if echo "$mongo_addrs" | grep -qvE '^(127\.0\.0\.1|\[::1\]):27017$'; then
      bad "27017 监听在非本机地址，存在暴露风险"
    else
      ok "27017 仅本机监听"
    fi
  else
    warn "27017 未监听（MongoDB 未启动）"
  fi
else
  warn "缺少 ss 命令，跳过端口检查"
fi

# ---------------------------------------------------------------- Nginx / 站点
section "Nginx 与站点"
if have nginx; then
  if nginx -t >/tmp/acp-nginx-check.log 2>&1; then
    ok "nginx -t 通过"
  else
    bad "nginx -t 失败：$(tail -3 /tmp/acp-nginx-check.log | tr '\n' ' ')"
  fi
fi
if systemctl is-active --quiet nginx 2>/dev/null; then
  ok "nginx 服务运行中"
else
  warn "nginx 服务未运行"
fi
[[ -f /etc/nginx/conf.d/acp.conf ]] && ok "已安装 /etc/nginx/conf.d/acp.conf" || warn "未安装 acp.conf（部署脚本会自动安装）"
[[ -d /etc/nginx/conf.d ]] && ls /etc/nginx/conf.d/default.conf* >/dev/null 2>&1 && warn "default.conf 仍在（可能抢占 80，部署脚本会备份移走）"

if [[ -f /var/www/acp/dist/index.html ]]; then
  ok "前端已发布：/var/www/acp/dist/index.html"
else
  warn "前端未发布（/var/www/acp/dist/index.html 不存在）"
fi

# ---------------------------------------------------------------- 应用
section "应用"
if [[ -f /opt/acp/server/package.json ]]; then
  ok "代码已上传：/opt/acp"
else
  warn "未发现 /opt/acp（首次部署时由 deploy.sh 创建）"
fi
if [[ -d /var/www/acp/dist/assets ]]; then
  ok "静态资源目录存在"
fi
if systemctl list-unit-files 2>/dev/null | grep -q '^pm2-root\.service'; then
  systemctl is-enabled --quiet pm2-root 2>/dev/null && ok "PM2 开机自启已启用" || warn "PM2 开机自启未启用（pm2 startup && pm2 save）"
else
  warn "未发现 pm2-root.service（执行 pm2 startup systemd 后生成）"
fi

if have curl; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3004/api/health 2>/dev/null || true)"
  case "$code" in
    200) ok "后端 /api/health = 200" ;;
    503) bad "后端可达但返回 503（数据库未连接）" ;;
    000|'') warn "后端 3004 未响应（首次部署前正常）" ;;
    *) warn "后端 /api/health 返回 $code" ;;
  esac
fi

# ---------------------------------------------------------------- 总结
section "总结"
printf '  OK=%d  WARN=%d  FAIL=%d\n' "$PASS" "$WARN" "$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  printf '\n存在 FAIL，先按提示修复，再执行部署。\n'
  exit 1
fi
printf '\n未发现阻塞项，可以执行：bash deploy/deploy.sh\n'
