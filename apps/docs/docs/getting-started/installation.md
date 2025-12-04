# Installation

This guide covers setting up Mosaic Life for local development.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+
- Python 3.12+
- uv (Python package manager)

## Quick Start

1. Clone the repository:

    ```bash
    git clone https://github.com/mosaic-stories/mosaic-life.git
    cd mosaic-life
    ```

2. Start all services:

    ```bash
    docker compose -f infra/compose/docker-compose.yml up -d
    ```

3. Access the application:

    - Frontend: http://localhost:5173
    - API: http://localhost:8080
    - API Docs: http://localhost:8080/docs
