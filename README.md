# NanoDFS MVP

NanoDFS is a compact HDFS-inspired distributed file system with two runtime roles in one Docker image:

- **Client node**: file manager, upload/download/delete, node config, reporting + CSV export.
- **Data node**: block storage server with local disk usage display and configurable upload/download rate limits.

## Quick start

### 1. Get the repository

When this project is published on GitHub, replace the URL below with your repository archive link. The placeholder shows the intended pattern.

```bash
# Example: download and extract the default branch as a tarball (adjust URL after publish)
curl -L -o nanodfs.tar.gz https://github.com/OWNER/REPO/archive/refs/heads/main.tar.gz
tar xzf nanodfs.tar.gz
cd REPO-main
```

Until the repo URL is final, clone or copy the project into a local directory and `cd` into it before the next steps.

### 2. Build the Docker image

From the repository root (where the `Dockerfile` lives):

```bash
docker build -t nanodfs:latest .
```

### 3. Run with Docker Compose

Use **two** compose files: one stack for the **client** and one for **data** nodes. Build the image once; both stacks reference `image: nanodfs:latest`.

#### `docker-compose.yml` (client node)

```yaml
services:
  client:
    image: nanodfs:latest
    container_name: nanodfs-client
    environment:
      - PORT=3000
      - PUBLIC_HOST=127.0.0.1
      - PUBLIC_PORT=3000
      - NANODFS_RUNTIME_DIR=/app/runtime
    ports:
      - "3000:3000"
    volumes:
      - client_runtime:/app/runtime

volumes:
  client_runtime:
```

Start it:

```bash
docker compose -f docker-compose.yml up -d
```

Open **http://localhost:3000**, choose **Client node**, then configure data nodes using the **host IP and mapped host ports** of your data containers (e.g. `host.docker.internal` or the host LAN IP, not `127.0.0.1` from inside another container, unless you use host networking).

#### `docker-compose.yml` (data nodes)

Example with two data-node containers on different host ports:

```yaml
services:
  data1:
    image: nanodfs:latest
    container_name: nanodfs-data-1
    environment:
      - PORT=3000
      - PUBLIC_HOST=127.0.0.1
      - PUBLIC_PORT=4001
      - NANODFS_RUNTIME_DIR=/app/runtime
    ports:
      - "4001:3000"
    volumes:
      - data1_runtime:/app/runtime

  data2:
    image: nanodfs:latest
    container_name: nanodfs-data-2
    environment:
      - PORT=3000
      - PUBLIC_HOST=127.0.0.1
      - PUBLIC_PORT=4002
      - NANODFS_RUNTIME_DIR=/app/runtime
    ports:
      - "4002:3000"
    volumes:
      - data2_runtime:/app/runtime

volumes:
  data1_runtime:
  data2_runtime:
```

Start it:

```bash
docker compose -f docker-compose.yml up -d
```

On each data container, open the mapped URL (e.g. **http://localhost:4001** and **http://localhost:4002**), choose **Data node**, and set rate limits as needed.

---

## Project structure

```text
.
├── Dockerfile                 # Multi-stage build: web + server, single runtime image
├── package.json               # Workspace root; scripts: build, start
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           # Express app, static UI, API mount
│       ├── types.ts
│       ├── routes/            # bootstrap, client, data HTTP routes
│       └── services/          # metadata, blocks, scheduling, metrics, etc.
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── pages/             # Role select, client, data node UI
        ├── components/        # e.g. report panel
        └── styles/
```
