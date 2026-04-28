FROM node:22-alpine AS deps

WORKDIR /app

# Deterministic install: copy the lockfile and use `npm ci`, which
# refuses to run if package.json and package-lock.json disagree. This
# pins the audit posture of the build to whatever was committed.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --include=dev


FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars must be present during `next build` because Next.js
# substitutes them into the client bundle at compile time. The CI
# workflow passes the same value the backend gets for APP_VERSION, so
# the running frontend reports its own build instead of the backend's
# /health version when the two images ship independently.
ARG NEXT_PUBLIC_APP_VERSION=""
ARG NEXT_PUBLIC_APP_BUILD_NUMBER=""
ARG NEXT_PUBLIC_APP_GIT_SHA=""
ARG NEXT_PUBLIC_APP_BUILD_DATE=""
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_BUILD_NUMBER=$NEXT_PUBLIC_APP_BUILD_NUMBER
ENV NEXT_PUBLIC_APP_GIT_SHA=$NEXT_PUBLIC_APP_GIT_SHA
ENV NEXT_PUBLIC_APP_BUILD_DATE=$NEXT_PUBLIC_APP_BUILD_DATE

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S tribu && adduser -S tribu -G tribu

# Next standalone output ships only the prod deps it traced as
# reachable (.next/standalone/node_modules), so the dev/test surface
# never lands in the runtime image. `static` and `public` must be
# copied alongside it because Next's standalone server expects them
# at fixed paths.
COPY --from=builder --chown=tribu:tribu /app/public ./public
COPY --from=builder --chown=tribu:tribu /app/.next/standalone ./
COPY --from=builder --chown=tribu:tribu /app/.next/static ./.next/static

USER tribu

EXPOSE 3000

CMD ["node", "server.js"]
