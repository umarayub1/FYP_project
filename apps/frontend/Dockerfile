FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG NEXT_PUBLIC_ENABLE_DEV_LOGIN=true
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_ENABLE_DEV_LOGIN=$NEXT_PUBLIC_ENABLE_DEV_LOGIN
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL

RUN npm run build && mkdir -p /app/public

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
