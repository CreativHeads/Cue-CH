# CreativHeads Cue (content tracker) at cue.creativheads.com.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY db ./db
COPY scripts/migrate.mjs scripts/set-password.mjs ./scripts/
COPY deploy/vps/scheduler.mjs ./deploy/scheduler.mjs
USER node
EXPOSE 3000
# apply new migrations, then start
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
