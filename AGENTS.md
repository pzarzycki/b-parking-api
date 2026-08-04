# AGENTS.md

## Project context

This repository is an alpha-stage **Parking Management API** monorepo. Build the clear implementation that meets the current requirement. The project is evolving quickly: backward compatibility, migrations for obsolete behavior, and compatibility shims are not required unless a task explicitly asks for them.

## Working principles

- Prefer simple, direct code and data models over abstraction, indirection, or premature optimization.
- Do not infer repository behavior from names, comments, or memory. Inspect the relevant code, configuration, API contracts, and tests first.
- Verify behavior in the runtime whenever practical. A successful type check or unit test alone does not prove an API, integration, container, or configuration change works.
- Fail fast. Validate required inputs and configuration at their boundary; return or raise clear, actionable errors immediately.
- Preserve useful errors. Do not hide failures behind broad exception handlers, silent defaults, retries, compatibility layers, or fallback behavior unless explicitly required.
- Make focused changes. Avoid unrelated refactors, formatting churn, generated artifacts, and speculative features.

## Repository layout and documentation

- `README.md` is the concise, GitHub-friendly entry point. Keep it user-facing and include the project's purpose, prerequisites, quick start, common commands, and links to deeper documentation.
- User-facing documentation is a static Docusaurus site sourced from `docs/` and configured in `docs/website/`, deployed through GitHub Pages. Scalar, via `@scalar/docusaurus`, renders the API reference from the canonical `specs/openapi.yaml`; the build copies that contract to the site's static assets. Swagger UI is separately served by the API at `/api/docs`. Use `npm run docs:check` to validate and build the deployable site and `npm run docs:preview` to test it locally. Do not add another API-reference renderer or an OpenAPI-to-Markdown generator.
- Docusaurus renders Mermaid diagrams through `@docusaurus/theme-mermaid`. Write diagrams as fenced `mermaid` code blocks in the relevant Markdown page. Keep diagrams source-controlled and maintainable; use them when they clarify relationships or flows that prose alone would make difficult to follow. Run `npm run docs:check` after changing a diagram.
- `specs/` contains the authoritative API, architecture, floor-plan, and other technical specification documents.
- Keep documentation coherent and non-redundant. Explain a topic fully in its primary home, then link to it from other locations rather than copying it. Update the relevant docs whenever a user-visible workflow, configuration option, endpoint, or architectural decision changes.

### OpenAPI contract quality

- `specs/openapi.yaml` is the canonical, contract-first source—not a generated artifact. The Fastify service loads this exact file for Swagger UI and serves it at `/openapi.yaml`; the static documentation build copies the same file for Scalar. Edit this file when the public HTTP contract changes.
- Do not attempt to infer rich API documentation by scraping imperative Fastify route handlers. A generator could only infer paths and methods from the current code; it cannot reliably derive lifecycle rules, security boundaries, idempotency, domain constraints, error semantics, or useful examples. If the project later adopts declarative route schemas as its single source of truth, explicitly redesign and test that architecture before switching to generated OpenAPI.
- Every public operation must have a tag, concise summary, and substantive description. The description must state the caller's goal and the meaningful rules for that operation—such as authentication scope, lifecycle transition, idempotency/replay behavior, or side effects—without repeating parameter and schema tables.
- Every tag must have a useful description. Where applicable, document security, parameters, request body, success response, expected problem responses, field descriptions, and realistic examples in the canonical OpenAPI contract.
- Treat a documentation page that renders only a title, request shell, and status line as an incomplete contract, not a renderer defect. Improve the OpenAPI contract first; do not add duplicate prose in Scalar, Swagger, README, or generated pages to compensate.
- When adding or changing a route, update the implementation and OpenAPI contract in the same change. Verify both directions: every implemented public method/path is documented, and every documented method/path is registered and returns the documented status/content/error shape at runtime.

## Implementation guidelines

- Keep module boundaries and interfaces obvious. Add an abstraction only when it reduces real duplication or isolates a real changing boundary.
- Use explicit configuration. Required values must be documented and validated on startup or at first use; do not invent defaults that mask a missing setting.
- Keep API contracts explicit: validate request data, use consistent response and error shapes, and make domain constraints visible in code.
- Prefer standard library and already-installed project dependencies. Add a dependency only when it materially simplifies the solution.
- Avoid supporting old APIs, deprecated configuration, or data formats during alpha unless requested.

## Validation and tests

- Run the narrowest relevant checks while developing, then run the appropriate project-level checks before handoff.
- Use the available tooling (`uv`, `npm`, and project scripts) rather than assuming a package manager or command. Inspect project configuration to find the canonical commands.
- Test behavior, not implementation details. Cover the happy path, important validation failures, and meaningful regressions.
- Keep the test suite proportionate: add or update tests for changed behavior, but do not add low-value tests merely to increase coverage.
- For changes affecting services, routes, persistence, configuration, or containers, validate the real integration path when feasible.

### Testing

- Keep unit tests database-free and deterministic. `npm test` / `npm run test:unit` must never start services or call a live API.
- Run integration tests only through the dedicated integration command. They must use a separate Compose project and disposable PostgreSQL database—never the local development volume.
- Integration tests must clean up their containers and database on success and failure.
- Require an explicit opt-in flag to run live integration tests.
- Run unit and integration tests in separate GitHub Actions workflows.

## Local deployment

- Local deployment is performed with Docker Compose. Treat the Compose configuration as the executable local environment.
- Before reporting deployment-related work complete, run the relevant `docker compose` command, inspect service status and logs, and exercise the affected endpoint or workflow.
- Do not claim containers or the API work without checking their actual runtime behavior.

## Before handoff

- Confirm the change matches the current specification and avoids unnecessary compatibility work.
- Run and report the checks that were actually performed, including runtime or Docker Compose validation when relevant.
- State any validation that could not be run and the concrete reason; never imply it passed.
