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
npm ci --prefix docs/website
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

The parking operations web app is available at [http://localhost:8080](http://localhost:8080). The API remains available at [http://localhost:3000](http://localhost:3000), with Swagger UI at [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

On a fresh Compose database the service creates `admin` / `admin` and uploads the repository's sample two-floor layout, so the dashboard is ready to use immediately. This local bootstrap credential is for initial setup only and must be changed immediately. Existing Compose data is retained in the named PostgreSQL volume.

### Frontend development

```bash
cd web
npm ci
npm run dev
```

The Vite server proxies API requests to the local API on port `3000`. Run `npm run web:build` from the repository root for the production frontend build.

The canonical OpenAPI contract is served at `/openapi.yaml`.
