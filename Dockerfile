FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm install

COPY server ./server
COPY web ./web
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /app/runtime && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
