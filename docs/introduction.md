---
sidebar_position: 1
slug: /
---

# Parking Garage Management API

The Parking Garage Management API manages one garage's floor-plan definition, current parking-spot state, vehicle sessions, staff users, and an auditable history of operational changes.

Use this documentation to understand the API contract and the floor-plan YAML uploaded to the service. The complete HTTP contract is available in the [API reference](/api-reference).

## Who uses the API

| Role | What it can do |
| --- | --- |
| Unauthenticated visitor | Download the current floor-plan YAML. |
| Attendant | Sign in, inspect availability, check vehicles in and out, and record manual spot occupancy or release. |
| Admin | All attendant actions, plus replace the floor plan, manage users, and read parking and audit history. |

Operational requests use a short-lived JWT bearer token from `POST /api/auth/login`. The public floor-plan download is the only endpoint that does not require authentication.

## Core workflow

1. An admin uploads a complete, validated floor-plan YAML document.
2. The API stores the document and synchronizes its floor, bay, and parking-spot projections.
3. An attendant checks in a vehicle, either choosing an available spot or letting the API assign the next one.
4. The attendant checks the vehicle out to close its session and release its spot.
5. Administrators use parking history and audit events to review prior activity.

## Important concepts

- There is one canonical garage layout. Replace it as a complete YAML document instead of managing floors or spots independently.
- A spot can be available, occupied by a vehicle, or manually occupied for a stated reason. Vehicle occupancy is released only through checkout.
- Vehicle sessions preserve immutable check-in details and have an optional checkout time. The same plate cannot have more than one active session.
- Authenticated state-changing operations create audit events.

Continue with the [database schema](database-schema) to see how these concepts relate, or read [floor plans](floor-plans) before preparing a layout upload.
