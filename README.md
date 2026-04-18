# NanoDFS

**NanoDFS** is a lightweight HDFS-inspired distributed file system for learning and benchmarking. A ClientNode web UI manages metadata, splits files into fixed-size blocks, and round-robin assigns blocks to DataNodes; downloads reassemble blocks with validation. DataNodes persist blocks locally with optional throughput limits. 

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
sudo docker compose -f docker-compose.data.yml up -d
```

Open **[http://HOST_IP:PORT](http://HOST_IP:PORT)** (default ports: 4001 - 4004), choose **Data node**, and set rate limits as needed.

#### Client Node:

```bash
sudo docker compose -f docker-compose.client.yml up -d
```

Open **[http://HOST_IP:PORT](http://HOST_IP:PORT)** (default port: 3000), choose **Client node**, then configure data nodes using the **host IP and ports** of your data nodes.