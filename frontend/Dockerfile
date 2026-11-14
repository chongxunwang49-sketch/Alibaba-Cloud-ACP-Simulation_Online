# 构建上下文是仓库根目录（docker-compose.yml 中 context: .）
# 这样既能拿到 frontend/，也能把 deploy/nginx.conf 打进运行镜像。
FROM node:20-alpine AS build

ARG NPM_REGISTRY=https://registry.npmjs.org
ENV NODE_OPTIONS=--max-old-space-size=768

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund --registry=$NPM_REGISTRY

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
