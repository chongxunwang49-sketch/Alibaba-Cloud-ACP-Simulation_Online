# 构建上下文是 server/（docker-compose.yml 中 context: ./server）
FROM node:20-alpine AS deps

ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=$NPM_REGISTRY

FROM node:20-alpine

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY data ./data

# 非 root 运行；应用只读文件系统，不需要写权限
USER node

EXPOSE 3004
CMD ["node", "src/server.js"]
