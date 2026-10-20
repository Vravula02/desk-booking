FROM node:22-slim

# Prisma needs OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma generate only needs a placeholder URL, not a real database
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]