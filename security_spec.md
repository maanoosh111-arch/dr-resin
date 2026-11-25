# Security Specification — DR Premium Resin Products

## Data Invariants
1. `storeSettings/{settingId}` contains zero PII and is readable only via targeted `get` by valid document ID (`^[a-zA-Z0-9_\-]+$`), never via `list`, and writable only by verified administrators (`isAdmin()`).
2. `orders/{orderId}` contains customer PII (`customerName`, `customerPhone`, `deliveryAddress`, `senderWalletPhone`). All reads, lists, creations, updates, and deletions via Firestore client SDK require verified `isAdmin()` authorization.
3. `admins/{adminUid}` is strictly read-only for the owning verified admin and never self-writable by arbitrary signed-in users.
4. `test/connection` permits single-document `get` only to validate SDK connectivity and forbids `list` and all writes.
5. Every string field enforces explicit `.size()` boundaries and every write validates exact allowed keys via `keys().hasAll(...)` and `keys().hasOnly(...)` as well as `affectedKeys().hasOnly(...)` on updates.

## Dirty Dozen Adversarial Payloads
1. Unauthenticated write to `/storeSettings/public` -> `PERMISSION_DENIED`.
2. Non-admin authenticated user write to `/storeSettings/public` -> `PERMISSION_DENIED`.
3. Unverified-email admin spoof (`email_verified: false`) writing `/orders/ORD-1001` -> `PERMISSION_DENIED`.
4. Unauthenticated `get` or `list` on `/orders` -> `PERMISSION_DENIED`.
5. Non-admin `get` on `/orders/ORD-1001` (PII leak test) -> `PERMISSION_DENIED`.
6. Self-escalation write to `/admins/{uid}` by non-admin -> `PERMISSION_DENIED`.
7. Shadow update adding ghost field `isVerified: true` to `/storeSettings/public` -> `PERMISSION_DENIED`.
8. Oversized string (>500 chars) in `storeSettings.customNote` -> `PERMISSION_DENIED`.
9. Invalid `orderId` path longer than 128 chars or containing invalid symbols -> `PERMISSION_DENIED`.
10. Invalid `status` value (e.g., `"Hacked"`) on `/orders/{orderId}` -> `PERMISSION_DENIED`.
11. Immutable `createdAt` or `orderCode` mutation on order update -> `PERMISSION_DENIED`.
12. Write attempt to `/test/connection` -> `PERMISSION_DENIED`.
