# Local Development Setup Guide

## Prerequisites

Before starting, ensure you have:

- Docker Desktop installed
- Docker Compose v2
- Node.js 20+
- Rust 1.76+
- Freighter browser extension (for testing)

## Services Overview

The `docker-compose.yml` file starts multiple services:

- **stellar-quickstart** - Local Stellar node
- **contracts** - Builds and deploys Wasm contracts
- **frontend** - Next.js development server
- **mock-service** - Mock API service on port 4000

## First Run

Start all services:

```bash
docker compose up
