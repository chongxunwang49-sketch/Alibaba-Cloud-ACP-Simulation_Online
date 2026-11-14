#!/usr/bin/env bash
set -u
cd /opt/acp

echo "== docker compose ps =="
docker compose ps

echo
echo "== restart policy / health =="
for c in $(docker compose ps -q); do
  docker inspect -f '{{.Name}}  restart={{.HostConfig.RestartPolicy.Name}}  {{if .State.Health}}health={{.State.Health.Status}}{{else}}state={{.State.Status}}{{end}}' "$c"
done

echo
echo "== resources =="
free -m | awk '/Mem:/ {printf "memory: used %s MB / %s MB\n", $3, $2}'
df -h / | tail -1
docker image ls --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | head -6
