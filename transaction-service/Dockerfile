FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
FROM node:18-alpine
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

RUN mkdir -p logs && chown -R nodejs:nodejs logs

USER nodejs
EXPOSE 3001 9091

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health/live',(r)=>{process.exit(r.statusCode===200?0:1)})"

ENTRYPOINT ["dumb-init","--"]
CMD ["sh","-c","node src/db/migrate.js && node src/index.js"]