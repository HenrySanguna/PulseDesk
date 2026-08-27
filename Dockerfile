FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
ENV CI=true
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm exec prisma generate
RUN pnpm nx run-many -t build,prune -p api,worker

FROM node:24-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
ENV CI=true
ENV NODE_ENV=production
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
WORKDIR /app
COPY --from=build /workspace/apps/api/dist ./apps/api
COPY --from=build /workspace/apps/worker/dist ./apps/worker
RUN pnpm --dir apps/api install --prod --frozen-lockfile --ignore-scripts \
 && pnpm --dir apps/worker install --prod --frozen-lockfile --ignore-scripts \
 && chown -R node:node /app
USER node
