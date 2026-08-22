# Contributing to async-erp-sync-engine

Thank you for taking the time to contribute! This document outlines how to get the project running locally, the conventions we follow, and the process for submitting changes.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Running Tests](#running-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Conventions](#coding-conventions)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating you agree to uphold a welcoming and respectful environment for everyone.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Docker** & **Docker Compose** (for Redis)
- **Git**

### 1. Fork & clone the repository

```bash
git clone https://github.com/bluevisi/async-erp-sync-engine.git
cd async-erp-sync-engine
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` if you need non-default Redis settings. The defaults work out of the box with the Docker Compose stack.

### 4. Start the infrastructure

```bash
docker compose up -d
```

This starts:
- **Redis 7** on port `6379` (with `noeviction` policy required by BullMQ)
- **App** on port `3000`

To run only Redis locally and the app via `npm run dev`:

```bash
docker compose up redis -d
npm run dev
```

---

## Development Workflow

| Command | Description |
|---|---|
| `npm run dev` | Start server + worker with hot-reload via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (production mode) |
| `docker compose up --build` | Rebuild image and start full stack |
| `docker compose logs -f app` | Tail live application logs |

---

## Running Tests

The test suite runs entirely without a live Redis connection (the queue layer is mocked).

```bash
npm test
```

Tests live in `tests/` and use **Jest** + **ts-jest**. When adding a feature:

1. Add or update tests in `tests/` that cover the new behaviour.
2. Ensure all existing tests still pass before opening a PR.
3. Aim for meaningful assertions over coverage numbers.

---

## Submitting a Pull Request

1. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — keep commits focused and atomic.

3. **Run the test suite** and confirm it passes:
   ```bash
   npm test
   ```

4. **Push your branch** and open a Pull Request against `main`:
   ```bash
   git push origin feat/your-feature-name
   ```

5. Fill in the PR template — describe *what* changed and *why*.

6. A maintainer will review and merge or request changes.

---

## Coding Conventions

- **TypeScript strict mode** is enabled — all types must be explicit.
- **Zod** is used for all runtime validation at system boundaries (HTTP input, job payloads).
- **No comments** explaining *what* the code does — use clear naming instead. Comments are reserved for non-obvious *why* (hidden constraints, workarounds, subtle invariants).
- **No unused code** — remove dead imports, variables, and exports before committing.
- Prefer editing existing files over creating new abstractions unless the use case clearly warrants it.

---

## Reporting Issues

Please open a [GitHub Issue](https://github.com/bluevisi/async-erp-sync-engine/issues) and include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behaviour
- Node.js version, OS, and Docker version (if relevant)

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
