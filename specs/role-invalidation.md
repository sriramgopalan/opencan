# Role Invalidation Spec

## Status
SUPERSEDED — implementation incorporated into specs/admin.md (decisions A-02, A-03, A-15). The per-JTI approach described here was replaced with a per-userId blocklist; see admin.md §6 for the final design.

## Problem
When an admin changes a user's role in the database, the user's 
JWT cookie retains the old role until expiry (up to 30 days).
A demoted ADMIN retains admin access for the remainder of their 
session.

## Proposed Solution: Redis JTI Blocklist

### Flow
1. Admin changes a user's role via tRPC procedure
2. Procedure writes the user's current JTI to Redis blocklist
   Key: session:blocklist:{jti}
   Value: "1"
   TTL: remaining JWT lifetime (exp - now in seconds)
3. Middleware checks blocklist on every protected request
4. If JTI is blocklisted, redirect to sign-in
5. User signs in fresh and gets correct role in new JWT

### Files to create/modify when implementing
- /lib/session-blocklist.ts — Redis blocklist utility
- /server/repositories/user.ts — add getUserActiveSessions(userId)
- /server/routers/admin.ts — role change procedure triggers blocklist
- /src/middleware.ts — add blocklist check after JWT verification

### Why Redis
- O(1) lookup per request
- TTL auto-expires entries — no cleanup needed
- Already in the stack (Docker Compose, CI)

### Security notes
- JTI is already included in every JWT (confirmed in payload)
- Blocklist entries are keyed by JTI not userId — surgical, 
  not a full logout
- On role upgrade (MEMBER → ADMIN): also invalidate so user 
  gets new JWT with elevated role immediately

## Dependencies
- Admin user management feature (Phase 1 Week 7)
- getUserActiveSessions repository function
