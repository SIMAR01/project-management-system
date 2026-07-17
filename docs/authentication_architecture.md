# Backend Authentication Architecture (Phase 1 & Phase 2)

This document provides a comprehensive overview of the design patterns, security rules, Redis data models, and routing strategies implemented in the Project Management System's Authentication Module.

---

## 1. System Directory Map

All authentication files are modular and decoupled under `src/`:

```
src/
├── config/
│   ├── database.ts             # MongoDB Mongoose connection handler
│   └── redis.ts                # Redis Client configuration and lifecycle hooks
│
├── controllers/
│   └── auth.controller.ts      # HTTP input parsing, cookie setting, and API output serialization
│
├── services/
│   └── auth.service.ts         # Encapsulates business logic, token rotation, and caching state
│
├── routes/
│   ├── index.ts                # Main API Router (/api/v1)
│   └── auth.routes.ts          # Auth endpoint routes mapping (/api/v1/auth)
│
├── models/
│   └── user.model.ts           # Mongoose User Schema and auto-hashing pre-save hooks
│
├── middleware/
│   ├── auth.middleware.ts      # Access JWT validation and Redis blacklist checking
│   ├── error.middleware.ts     # Global exception caught formatting (MongoDB, CastError, etc.)
│   ├── validate.middleware.ts  # Generic request payload Zod schema checker
│   └── rateLimit.middleware.ts # Custom sliding-window rate-limiter using Redis
│
├── validations/
│   └── auth.validation.ts      # Zod validation rules for registration and login
│
├── utils/
│   ├── ApiError.ts             # Structured class representing operational exceptions
│   ├── ApiResponse.ts          # Uniform wrapper for successful actions
│   ├── asyncHandler.ts         # Decorator to route async errors to error handler
│   ├── jwt.ts                  # Signer and verifier functions for JWT tokens
│   ├── password.ts             # Password utility wrapping Bcrypt (Salt factor: 12)
│   └── constants.ts            # Global cookie settings and token expiration times
│
├── types/
│   └── express.d.ts            # Declaration-merging to extend Express Request object
│
└── sockets/
    └── auth.socket.ts          # Stateless Socket.IO handshake authentication middleware
```

---

## 2. Redis Caching Strategy

To optimize database lookups and prevent token hijacking, Redis is used in three distinct contexts:

### A. Active Refresh Session Cache
- **Key Schema**: `session:{userId}:{sessionId}`
- **Value**: JSON string containing session metadata and token details:
  ```json
  {
    "sessionId": "UUID",
    "userId": "String (UUID)",
    "ip": "String (Client IP)",
    "userAgent": "String",
    "browser": "String",
    "os": "String",
    "device": "String",
    "lastActive": "ISO String",
    "createdAt": "ISO String",
    "refreshToken": "Plain Refresh Token"
  }
  ```
- **TTL**: `604800 seconds` (7 days)
- **Flow**: During login, a unique `sessionId` (UUID) is generated and embedded in the refresh token payload. The session details are stored in Redis under the `session:{userId}:{sessionId}` key. During `/refresh-token` requests, the token is decoded statelessly, and the corresponding Redis key is queried. If the refresh token matches, the session is rotated (old deleted, new generated and set). MongoDB is bypassed for active session validation unless there is a Redis cache miss.

### B. Access Token Blacklist
- **Key Schema**: `blacklist:{accessToken}`
- **Value**: `"true"`
- Blacklist TTL: Dynamic (Equal to the remaining duration of the Access Token's 4-hour lifespan)
- **Flow**: When a user logs out, the access token is cached in Redis for its remaining lifetime. Any request attempting to use a blacklisted token will be rejected with an HTTP 401 response by `auth.middleware.ts`.

### C. Rate Limiter Tracker
- **Key Schema**: `rate-limit:auth:{clientIp}`
- **Value**: Incremental count
- **TTL**: `900 seconds` (15 minutes sliding/fixed window)
- **Flow**: Incremented on every request to `/api/v1/auth/*`. Returns an HTTP 429 error if the count exceeds 100 requests within 15 minutes.

---

## 3. Real-Time Security (Socket.IO Handshake)

Socket.IO connections are authenticated during the initial handshake stage.

- **File**: [auth.socket.ts](file:///e:/tekki%20web%20task/project-management-system/backend/src/sockets/auth.socket.ts)
- **Handshake Logic**:
  1. Reads the token from `socket.handshake.auth.token` or headers.
  2. Verifies the token signature statelessly with **0 database lookups**.
  3. Attaches the parsed payload (ID, email, username) directly onto `socket.user`.
  4. If invalid or expired, rejects the handshake with `Authentication error`.

---

## 4. API Specification & Payloads

### A. Registration (`POST /api/v1/auth/register`)
- **Validation**:
  - `name`: String (2-50 chars)
  - `username`: Lowercase, alphanumeric/underscore (3-30 chars, unique)
  - `email`: Valid lowercase email (unique)
  - `password`: String (6-128 chars)
- **Logic**: Registers user in MongoDB. Password is encrypted automatically in Mongoose schema pre-save hook using bcrypt (work factor: 12).
- **Success Response (201)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "_id": "60d0fe...",
      "name": "Admin",
      "username": "admin",
      "email": "admin@example.com",
      "createdAt": "2026...",
      "updatedAt": "2026..."
    }
  }
  ```

### B. Login (`POST /api/v1/auth/login`)
- **Validation**:
  - `emailOrUsername`: String
  - `password`: String
- **Logic**: Validates credentials. Sets `refreshToken` as an HTTP-only, secure, sameSite `'strict'` cookie. Returns `accessToken` in body. Caches session in Redis.
- **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "60d0fe...",
        "name": "Admin",
        "username": "admin",
        "email": "admin@example.com"
      },
      "accessToken": "eyJhbGci..."
    }
  }
  ```

### C. Token Refresh (`POST /api/v1/auth/refresh-token`)
- **Logic**: Inspects cookie refresh token. Verifies signature, validates presence in Redis session cache (zero MongoDB hits), deletes old Redis key, issues and sets a new cookie/access token, and saves new session key in Redis.
- **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Access token refreshed successfully",
    "data": {
      "accessToken": "eyJhbGci..."
    }
  }
  ```

### D. Logout (`POST /api/v1/auth/logout`)
- **Authorization**: Requires Bearer Access Token in header.
- **Request Body** (optional):
  ```json
  {
    "all": boolean,          // If true, terminates all active sessions for the user
    "sessionId": string     // ID of a specific session to terminate
  }
  ```
- **Logic**:
  - If `all` is `true`, scans and deletes all Redis session keys matching `session:{userId}:*` and clears all MongoDB refresh tokens.
  - If `sessionId` is provided:
    - Verifies if the session exists in Redis under `session:{userId}:{sessionId}`. If not found, throws a `400 Bad Request` error with the message `"Session ID is not valid for this user"`.
    - Otherwise, deletes the specific key from Redis and filters out the corresponding refresh token from MongoDB.
  - If neither is provided, terminates the current session (identifying it using the refresh token cookie).
  - Always blacklists the current Access Token in Redis for its remaining TTL and clears the HTTP-only cookie if the current session or all sessions are logged out.
- **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "Logout successful",
    "data": {
      "loggedOutSessions": [
        {
          "sessionId": "...",
          "ip": "...",
          "browser": "...",
          "os": "...",
          "device": "..."
        }
      ]
    }
  }
  ```

### E. Get Current Profile (`GET /api/v1/auth/me`)
- **Authorization**: Requires Bearer Access Token in header.
- **Success Response (200)**:
  ```json
  {
    "success": true,
    "message": "User profile fetched successfully",
    "data": {
      "_id": "60d0fe...",
      "name": "Admin",
      "username": "admin",
      "email": "admin@example.com",
      "createdAt": "2026...",
      "updatedAt": "2026..."
    }
  }
  ```

---

## 5. Global Error Payload Structure

All exceptions flow through `error.middleware.ts` and return standard client structures:

```json
{
  "success": false,
  "message": "Clean Error Message Description",
  "errors": [],
  "stack": null
}
```
- In `development` mode, `stack` contains the error stack trace.
- In `production` mode, `stack` is set to `null` and general errors are masked to prevent data leaks.
- Captures MongoDB duplicate constraints (`code 11000`), casting issues, and validation failures, converting them into standard bad-request/conflict errors.
