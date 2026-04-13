# NanoDFS

NanoDFS is a HDFS-inspired distributed file system:

- **Client node**: file manager, upload/download/delete, node config, reporting + CSV export.
- **Data node**: block storage server with local disk usage display and configurable upload/download rate limits.

## Quick start

### 1. Get the repository

Clone:

```bash
git clone https://github.com/XiaoWingHong/NanoDFS.git
cd NanoDFS
```

### 2. Build the Docker image

if docker is not installed, please install it first (for Ubuntu 22.04+):

```bash
sudo apt update
sudo apt install docker.io
sudo apt install docker-compose-v2
```

From the repository root:

```bash
sudo docker build -t nanodfs:latest .
```

### 3. Run with Docker Compose

#### Data Node:

```bash
docker compose -f docker-compose.data.yml up -d
```

Open **[http://HOST_IP:4001](http://HOST_IP:4001)** and **[http://HOST_IP:4002](http://HOST_IP:4002)**, choose **Data node**, and set rate limits as needed.

#### Client Node:

```bash
docker compose -f docker-compose.client.yml up -d
```

Open **[http://HOST_IP:3000](http://HOST_IP:3000)**, choose **Client node**, then configure data nodes using the **host IP and ports (4001 & 4002)** of your data nodes.

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

