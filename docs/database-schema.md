---
sidebar_position: 2
---

# Database schema

The service stores the uploaded layout as one canonical document and maintains relational projections for efficient operational queries. Parking sessions and audit events preserve history independently from the current spot state.

```mermaid
erDiagram
    USERS {
        uuid id PK
        string username UK
        string password_hash
        string role
        boolean active
    }
    GARAGE_LAYOUT {
        int id PK "singleton"
        text raw_yaml
        integer revision
        string content_hash
    }
    FLOORS {
        string id PK
        integer level UK
        string name
    }
    BAYS {
        string id PK
        string floor_id FK
        string name
    }
    PARKING_SPOTS {
        string id PK
        string bay_id FK
        string number
        string status
        string occupancy_source
        string manual_reason
    }
    PARKING_SESSIONS {
        uuid id PK
        string parking_spot_id FK
        string license_plate
        timestamptz checked_in_at
        timestamptz checked_out_at
    }
    AUDIT_EVENTS {
        uuid id PK
        uuid actor_id FK
        string action
        string entity_type
        string entity_id
        jsonb details
    }

    USERS o|--o{ GARAGE_LAYOUT : uploads
    GARAGE_LAYOUT ||--o{ FLOORS : projects
    FLOORS ||--|{ BAYS : contains
    BAYS ||--|{ PARKING_SPOTS : contains
    PARKING_SPOTS ||--o{ PARKING_SESSIONS : records
    USERS o|--o{ AUDIT_EVENTS : performs
```

## Layout and live state

`garage_layout` is a singleton record containing the original uploaded YAML, a revision, a SHA-256 content hash, update time, and uploader. Its projected `floors`, `bays`, and `parking_spots` records make availability queries and lifecycle checks efficient.

`parking_spots.status` is the current operational state. When a spot is manually occupied, `occupancy_source` is `manual` and a reason is required. Vehicle occupancy is associated with an active parking session and cannot be released through the manual status endpoint.

## History and accountability

`parking_sessions` retain check-in details even after checkout. Database constraints permit at most one active session for a plate and for a spot, protecting against concurrent double assignment.

`audit_events` are append-only records of authenticated changes. Their actor is nullable only for system bootstrap, and their entity fields allow a single audit stream to refer to layouts, users, spots, sessions, and other domain records.
