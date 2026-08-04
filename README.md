# Parking Garage Management API

Contract-first backend for managing a single parking garage: its uploaded floor plan, live parking-spot state, vehicle sessions, users, and auditable actions.

## Documentation

The user documentation is published at [pzarzycki.github.io/b-parking-api](https://pzarzycki.github.io/b-parking-api/). It includes the product introduction, database schema, floor-plan guide, and static API reference.

The site is built with Docusaurus and does not require Docker.

### Prerequisites

- Node.js 22 or later
- npm

### Local documentation workflow

```bash
npm ci
npm run docs:check
npm run docs:start
```

Open the local URL printed by Docusaurus. To serve the production build instead, run:

```bash
npm run docs:preview
```

`docs:check` validates the OpenAPI contract and example floor plan, generates the floor-plan illustrations, and builds the deployable static site.

GitHub Pages deployment is automated on pushes to `main`. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once before the first deployment.

## API and design sources

- [System design](specs/system-design.md)
- [Canonical OpenAPI contract](specs/openapi.yaml)
- [Example floor-plan YAML](examples/garage-layout.yml)

## API local workflow

```bash
docker compose up --build
```

On an empty database the service creates `admin` / `admin`. This bootstrap credential is for initial local setup and must be changed immediately. Setting `DEVELOPER_MODE=true` outside production additionally creates the `developer` / `developer` attendant account.

Swagger UI is available at `/api/docs`; the canonical contract is served at `/openapi.yaml`.
