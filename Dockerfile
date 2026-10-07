FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
COPY --chown=node:node package.json server.js database.js create-admin.js seed-products.json ./
COPY --chown=node:node index.html app.js styles.css logo-cropped.png ./
COPY --chown=node:node ["Logo transparent.png", "./"]
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
