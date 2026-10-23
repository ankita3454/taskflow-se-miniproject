FROM node:24.7.0-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx prisma generate

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

USER node

CMD ["npm", "start"]