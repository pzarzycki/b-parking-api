FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY specs ./specs
COPY examples ./examples
COPY tsconfig.json ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
