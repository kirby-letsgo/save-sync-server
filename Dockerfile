FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# The server on an in-memory database (PGlite), on :3000, starting empty every time: what a client
# app's end-to-end tests run against, so they need neither Postgres nor a checkout of this repo.
# Not for deployment — nothing it stores survives the container.
FROM deps AS test
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "scripts/local.ts"]

FROM deps AS build
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
