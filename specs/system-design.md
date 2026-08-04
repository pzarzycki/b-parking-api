# Parking Garage Management System — v1 specification

## Purpose and scope

The system manages one garage's physical layout, available/occupied spots, vehicle parking sessions, authenticated users, and an immutable audit trail. It is a JSON REST API implemented with Node.js, TypeScript, Fastify, PostgreSQL, and Prisma. A separate React/TypeScript application consumes the API; it is not part of this delivery.

The API is contract-first: `specs/openapi.yaml` is authoritative. The Fastify service loads and serves that exact file at `/openapi.yaml`; Swagger UI is served at `/api/docs`. Except for the public floor-plan download, all request and response bodies are JSON.

## Actors and authorization

| Actor | Capabilities |
| --- | --- |
| Unauthenticated visitor | Download the current floor-plan YAML only. |
| Attendant | Authenticate, view spot state, check cars in/out, and record manual spot occupancy/release. |
| Admin | All attendant capabilities; upload the floor plan; create and administer users; read parking and audit history. |

Authentication is a short-lived JWT bearer token issued by `POST /api/auth/login`. Passwords are stored using Argon2id. The first startup against an empty database creates `admin` / `admin`; it is an initialization exception, not a recurring seed. Developer mode is rejected in production and, when explicitly enabled, creates `developer` / `developer` as an attendant.

## Layout definition

There is exactly one `garage_layout` record containing the original uploaded YAML document, a revision, content hash, uploader, and update timestamp. It is returned verbatim as `application/yaml` by `GET /api/garage/floor-plan` so the frontend has one simple visual-definition source.

Admins replace it through `PUT /api/garage/floor-plan` using a JSON `{ "yaml": "..." }` body. The API parses and validates the document, then transactionally stores it and synchronizes relational floor, bay, and spot projections. Upload is the only layout-management interface; there are no independent floor, bay, or spot-definition CRUD APIs.

The layout document has this required shape:

```yaml
version: 1
garage:
  id: downtown-garage
  name: Downtown Garage
floors:
  - id: P1
    level: 0
    name: Ground floor
    canvas: { width: 1200, height: 800 }
    bays:
      - id: P1-A
        name: Bay A
        spots:
          - id: P1-A-001
            number: "001"
            geometry: { x: 80, y: 100, width: 42, height: 86, orientation: 0 }
    features:
      - id: drive-1
        type: lane
        points: [{ x: 0, y: 300 }, { x: 1200, y: 300 }]
```

`id` values are stable identifiers matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. Spot IDs, bay IDs, floor IDs, feature IDs, and floor levels are globally unique in a document. Floor level `0` is ground level; gates are permitted only there. Canvases and spot dimensions are positive finite numbers; spot coordinates are non-negative; orientation is a number in degrees clockwise around the spot centre. A `lane` is a marked parking aisle; a `way` is a circulation route; `wall` is a barrier. Each is an arbitrary polyline with at least two distinct points. A `gate` additionally declares `direction` as `in` or `out`; it is a two-point ground-floor entry/exit crossing. The importer rejects duplicate IDs, invalid or out-of-bounds geometry, intersecting spots, malformed YAML, and removal/move/renumber of an occupied or historically referenced spot. Non-destructive changes such as labels and geometry are allowed.

Repository examples in `examples/` are upload-ready templates, not a second source of truth.

## Persistent model and invariants

- `users`: UUID, unique username, password hash, role, active state, creation/update timestamps.
- `garage_layout`: singleton row, raw YAML, revision, SHA-256 hash, and uploader.
- `floors`, `bays`, `parking_spots`: layout projection. `parking_spots.status` is the current state; `occupancy_source` is `vehicle` or `manual`; manual state has a mandatory reason.
- `parking_sessions`: immutable check-in data (normalized uppercase plate, spot ID, check-in time) plus nullable check-out time. A partial unique index permits only one active session per plate and spot.
- `audit_events`: append-only events recording actor (nullable only for system bootstrap), action, entity type/ID, time, and structured details.

All database times use PostgreSQL `timestamptz`; externally visible times are UTC ISO-8601 strings. Every state-changing request, including a failed layout replacement after validation succeeds but before persistence, is handled in a single transaction; successful authenticated mutations create an audit event within the same transaction.

## Parking behavior

Check-in normalizes the supplied plate by trimming and uppercasing it. A currently active plate is rejected with `409`. A requested spot must be available; when omitted, the service locks and selects the first available spot in floor, bay, and spot-number order. It creates the session, marks the spot vehicle-occupied, and emits an audit event atomically. Row locks plus partial unique indexes prevent concurrent double assignments.

Check-out accepts exactly one of session ID or license plate. It finds the active session, sets `checkedOutAt`, marks the associated vehicle-occupied spot available, and records an audit event atomically.

Direct spot status updates exist for non-vehicle conditions. Marking a spot occupied requires a reason and creates manual occupancy but no parking session. A manual spot can be released through the same endpoint. Vehicle occupancy can only be released by check-out, and neither a manual-occupied nor a vehicle-occupied spot can accept a new check-in.

## Error, pagination, and operations policy

Errors use `application/problem+json` with `type`, `title`, `status`, `detail`, and stable `code`. Validation errors include an `errors` array. Collections use positive `page` and `pageSize` query parameters (default 1 and 50, maximum 100) and return `{ items, page, pageSize, total }`.

Required startup configuration is `DATABASE_URL` and `JWT_SECRET`; missing values fail startup. `CORS_ORIGIN` is explicit in deployed environments. Docker Compose supplies local-only values, waits for PostgreSQL health, runs migrations/bootstrap, and uses a named local database volume.

Unit tests remain database-free. Opt-in integration tests run only through a dedicated disposable Compose project and cover the full HTTP/PostgreSQL flow, including concurrent check-in contention. No unit command starts containers or calls a live API.
