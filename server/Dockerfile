# Onyx | Author: differentiatorX <madhur.m2006@gmail.com>
FROM node:20-alpine
LABEL org.opencontainers.image.authors="differentiatorX <madhur.m2006@gmail.com>" \
      org.opencontainers.image.source="https://github.com/differentiatorX/onyx" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
