FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN addgroup -S tribu && adduser -S tribu -G tribu

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/i18n ./i18n
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/themes ./themes
COPY --from=builder /app/contexts ./contexts
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/components ./components
COPY --from=builder /app/public ./public

RUN chown -R tribu:tribu /app
USER tribu

EXPOSE 3000

CMD ["npm", "start"]
