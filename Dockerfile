FROM oven/bun:1
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ src/
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "src/main.ts"]
