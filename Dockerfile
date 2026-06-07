FROM node:20-alpine
ARG PORT=7000
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${PORT}
# NODE_MAX_OLD_SPACE limits V8's heap (old-space) so that Node
# throws a clean Allocation–failed error instead of getting
# OOM–killed by the kernel when memory runs away.
#   – Must be smaller than the container memory limit.
#   – Keep ~128–256 MB of headroom for new–space, stack, and buffers.
#   – Without Valkey (shared cache) each replica holds its own cache in heap.
#   – With Valkey the heap is mostly per–request buffers, so you can lower this.
#   – Recommended values:
#       1 replica:  1024 MB (heavy traffic on a single node)
#       2 replicas: 768 MB
#       3 replicas: 512 MB
ENV NODE_MAX_OLD_SPACE=${NODE_MAX_OLD_SPACE:-512}
CMD node --max-old-space-size=${NODE_MAX_OLD_SPACE} src/index.js
