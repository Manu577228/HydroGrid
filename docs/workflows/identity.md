# Authentication lifecycles

Citizen accounts, owned practice workspaces and the private field board have distinct credentials. Exercise, operator and field roles use their own access checks. The public Vercel app uses first-party HTTP requests through an API rewrite. Render accepts the exact Vercel origin on secure requests with same-origin browser metadata. The combined Render fallback keeps its own first-party path. [Security](../security.md) · [Deployment](../deployment.md#dedicated-vercel-frontend)

## Registration

```mermaid
sequenceDiagram
  actor U as Citizen
  participant B as Browser
  participant A as Account API
  participant D as PostgreSQL
  U->>B: Submit display name, email and password
  B->>A: Same-origin JSON POST /api/account/register
  A->>A: Validate origin, rate and password size
  A->>A: Normalize email and hash password with BCrypt
  A->>D: Insert account and new session with refresh digest
  alt New email
    D-->>A: Commit citizen account and session
    A-->>B: 201 with access token and refresh Set-Cookie
    B->>B: Keep access token and profile in memory
  else Email already registered
    D-->>A: Unique email conflict
    A-->>B: 409
  end
```

The public form creates a citizen profile. The password limits are at least 12 code points and at most 72 UTF-8 bytes. The server stores the password hash and the refresh digest. Registration is rate-limited, and credential verification runs in a bounded pool.

## Login

```mermaid
sequenceDiagram
  actor U as Citizen
  participant B as Browser
  participant A as Account API
  participant D as PostgreSQL
  U->>B: Enter citizen credentials
  B->>A: Same-origin JSON POST /api/account/login
  A->>D: Read password hash for normalized email
  A->>A: Check rate limits and verify BCrypt
  alt Valid credentials
    A->>D: Create session and revoke previous cookie session if present
    A-->>B: Access token and new refresh Set-Cookie
  else Wrong email or password
    A-->>B: 401
  end
```

The server calculates against a placeholder BCrypt hash for an unknown email. Active profile requests require the JWT to resolve to a valid account session. Login and registration can reject a request before writing when rate or validation checks fail. [Account endpoint implementation](../../backend/src/main/java/com/hydrogrid/api/AccountController.java)

## Session restoration

```mermaid
sequenceDiagram
  participant B as AccountProvider on app startup
  participant A as Account API
  B->>A: POST /api/account/refresh with the origin-scoped cookie if present
  alt Valid session
    A-->>B: Rotate cookie and return account data and access token
    B->>B: Restore signed-in profile and schedule next refresh
  else No cookie
    A-->>B: 204
    B->>B: Restore signed-out state
  else Session rejected
    A-->>B: Authentication or origin error
    B->>B: Restore signed-out state
  else Transport or service failure
    B->>B: Mark unavailable and allow recovery
  end
```

The access token lives in memory. The browser uses the cookie to restore after a reload. A restore call checks again when an unavailable client comes online. The cookie is host-only with `HttpOnly`, `SameSite=Strict`, `Path=/api/account` and `Secure` on HTTPS. Each origin has its own sign-in cookie. [Browser account provider](../../frontend/src/account.tsx)

## Refresh-token rotation

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Account API
  participant D as PostgreSQL
  B->>B: Serialize account mutations with a browser lock when available
  B->>A: POST /api/account/refresh using current HttpOnly cookie
  A->>A: Validate request and generate a new random refresh token
  A->>D: Replace matching unexpired refresh digest atomically
  alt Active digest found
    D-->>A: Return existing session and expiration
    A-->>B: Set new cookie and issue short-lived access token
  else Old or expired digest
    D-->>A: No matching active session
    A-->>B: Reject refresh
  end
```

The account session expires 14 days after creation. Rotation keeps that deadline. The access token expires after up to 10 minutes. Concurrent reuse of the old digest can succeed once because the database updates the matching digest atomically. The browser uses Web Locks when available and a local request queue otherwise. [SQL rotation and profile checks](../../backend/src/main/java/com/hydrogrid/api/AccountStore.java) · [Browser refresh](../../frontend/src/account.tsx)

## Logout

```mermaid
sequenceDiagram
  actor U as Citizen
  participant B as Browser
  participant A as Account API
  participant D as PostgreSQL
  U->>B: Sign out
  B->>A: Same-origin JSON POST /api/account/logout
  A->>D: Delete session matched by the refresh digest when present
  A-->>B: 204 and expire refresh cookie
  B->>B: Clear account memory and protect profile route
  Note over A,D: Further protected profile calls require an active session
```

Logout revokes the current matching session. The protected profile route sends signed-out users to login. Browser-owned exercises and the local outbox have their own credentials. [Logout implementation](../../backend/src/main/java/com/hydrogrid/api/AccountController.java) · [Profile route](../../frontend/src/pages/Account.tsx)

## Demo workspace access

```mermaid
sequenceDiagram
  participant B as Exercise browser
  participant A as Demo API
  participant D as PostgreSQL
  B->>B: Load or create workspace ID and separate owner proof
  B->>A: POST /api/auth/demo with workspace, proof and exercise role
  A->>D: Create seeded workspace or check stored owner digest
  alt New or matching owner proof
    D-->>A: Return authorized workspace
    A-->>B: Two-hour role JWT scoped to owned exercise
    B->>A: Use bearer JWT for allowed exercise actions
  else Existing ID with different or missing ownership
    D-->>A: Ownership check failed
    A-->>B: Deny token issuance
  end
```

The proof is random and independent of the workspace ID. Both are origin-local browser storage. Knowing the ID alone cannot reopen the workspace. These tokens apply to practice actions. [Demo token issuance](../../backend/src/main/java/com/hydrogrid/api/DemoController.java) · [Ownership and seed](../../backend/src/main/java/com/hydrogrid/store/SessionStore.java) · [Browser credentials](../../frontend/src/api.ts)

## Private field workspace access

```mermaid
sequenceDiagram
  actor U as Authorized test participant
  participant B as Live Bengaluru browser
  participant A as Field API
  U->>B: Enter configured test access code
  B->>A: POST /api/field/access with code
  alt Workspace enabled and code matches
    A-->>B: Eight-hour FIELD bearer token with version and device subject
    B->>B: Retain session in this browser tab
    B->>A: GET /api/field/board with bearer token
    A->>A: Check FIELD role and current access version
    A-->>B: Return private board
  else Workspace unavailable or code invalid
    A-->>B: Reject access
  end
```

A FIELD token gives access to the shared test board, subject to its access version and expiration. Exercise and operator roles are authorized separately. Location sharing starts with an explicit action. When the configured access changes, version checks invalidate prior tokens. The board is intended for authorized testers. [Field access checks](../../backend/src/main/java/com/hydrogrid/api/FieldController.java) · [GPS workflow](live-data.md#device-permission-and-private-sharing)
