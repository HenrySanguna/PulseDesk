FROM node:24-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
ENV CI=true
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
# prisma.config.ts requires DATABASE_URL to be resolvable to load at all,
# even for `generate` (schema codegen, no real DB connection needed). Real
# platform secrets aren't available at Docker build time, so a syntactically
# valid placeholder is enough — this never carries into the runtime stage.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm exec prisma generate
RUN pnpm nx run-many -t build,prune -p api

# node:24-slim (Debian/glibc), not -alpine (musl): argon2's native prebuild
# only ships a glibc linux-x64 binary, no musl variant — on alpine it fails
# at boot with "No native build was found ... libc=musl".
FROM node:24-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
ENV CI=true
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/apps/api/dist ./apps/api
RUN pnpm --dir apps/api install --prod --frozen-lockfile --ignore-scripts \
 && chown -R node:node /app
USER node
CMD ["node", "apps/api/main.js"]
