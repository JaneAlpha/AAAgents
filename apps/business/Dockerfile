FROM node:22-slim

WORKDIR /app

# Prisma 需要 OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 先复制清单以复用依赖层
COPY package.json tsconfig.base.json ./
COPY apps/business/package.json apps/business/
COPY apps/runtime/package.json apps/runtime/
COPY apps/admin-web/package.json apps/admin-web/

ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry "$NPM_REGISTRY" && npm install --no-audit --no-fund

# 复制源码并构建（清理可能混入的增量缓存，强制全量编译）
COPY . .
RUN rm -f apps/*/tsconfig.tsbuildinfo
RUN npm run build -w @hedging/business
RUN npm run build -w @hedging/admin-web
RUN mkdir -p apps/business/public && cp -r apps/admin-web/dist/. apps/business/public/
RUN npx prisma generate --schema apps/business/prisma/schema.prisma

ENV NODE_ENV=production
ENV ADMIN_WEB_ROOT=/app/apps/business/public
EXPOSE 3000

# 启动前同步 schema 并写入演示种子数据（幂等）
CMD ["sh", "-c", "npx prisma db push --schema apps/business/prisma/schema.prisma --skip-generate --accept-data-loss && npm run seed -w @hedging/business && node apps/business/dist/main.js"]
