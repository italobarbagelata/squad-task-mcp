FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Inside the container we must listen on all interfaces; the host/proxy controls exposure.
ENV HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev && chown -R node:node /app
COPY --from=builder --chown=node:node /app/build ./build
USER node
EXPOSE 3001
CMD ["node", "build/index.js", "--http"]
