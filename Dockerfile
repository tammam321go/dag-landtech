# Optional: run the Dag API and front end in a container (Railway, Fly.io, any Docker host).
#   docker build -t dag . && docker run -p 8787:8787 -e DAG_GATE_SEED=$(openssl rand -hex 32) -e DAG_ORACLE_SEED=$(openssl rand -hex 32) dag
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8787 DAG_DATA_DIR=/tmp/dag-data NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server/http.js"]
