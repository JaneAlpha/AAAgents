FROM node:22-slim

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/business/package.json apps/business/
COPY apps/runtime/package.json apps/runtime/
COPY apps/admin-web/package.json apps/admin-web/

ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry "$NPM_REGISTRY" && npm install --no-audit --no-fund

COPY . .
RUN rm -f apps/*/tsconfig.tsbuildinfo
RUN npm run build -w @hedging/runtime

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/runtime/dist/main.js"]
