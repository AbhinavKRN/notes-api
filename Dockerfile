FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm
COPY src ./src
COPY public ./public
ARG GIT_SHA=dev
ENV NODE_ENV=production GIT_SHA=$GIT_SHA
USER 1000
EXPOSE 3000
CMD ["node", "src/index.js"]
