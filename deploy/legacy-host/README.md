# 宿主机部署方案（已归档）

这里的文件是 Docker 化之前的宿主机裸装方案：

| 文件 | 作用 |
| --- | --- |
| `nginx.conf` | 宿主机 Nginx：静态目录 `/var/www/acp/dist` + `/api` 反代 `127.0.0.1:3004` |
| `ecosystem.config.js` | PM2 配置（单实例、300 MB 内存上限） |
| `deploy.sh` | 本地 tar + scp 上传，远端 npm ci + PM2 启动 |
| `preflight.sh` | 上线前只读自检（系统、端口、Mongo、Nginx、PM2） |
| `push.ps1` | Windows 无 bash 时的上传脚本 |

现在的主部署路径是仓库根目录的 `docker-compose.yml` + `deploy.sh`，说明见 `docs/04-Docker部署.md`。
保留这些文件只为回退或对照，不建议新环境使用。
