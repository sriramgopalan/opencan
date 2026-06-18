# Deployment Requirements

## Reverse Proxy / IP Header Configuration

**CRITICAL: Guest vote deduplication can be bypassed without this setting.**

The application uses the client IP address (via `x-forwarded-for` or `x-real-ip` headers) to deduplicate guest votes. If an attacker can set arbitrary `x-forwarded-for` headers, they can submit unlimited guest votes by rotating fake IP values.

### Required configuration

Your reverse proxy (nginx, Caddy, AWS ALB, Cloudflare, etc.) **must** overwrite the `x-forwarded-for` header with the real client IP before requests reach the Next.js application. Do **not** pass through a client-supplied `x-forwarded-for` header.

**nginx example:**
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

**Caddy example:**
```caddyfile
header_up X-Forwarded-For {remote_host}
```

**AWS ALB:** Enable "X-Forwarded-For" header preservation is off by default; ALB sets it to the true client IP. No action needed.

**Cloudflare:** Use `CF-Connecting-IP` header instead (requires middleware change).

## IP_HASH_SECRET Environment Variable

Set `IP_HASH_SECRET` to a unique, randomly generated 32-byte hex string per deployment:

```bash
openssl rand -hex 32
```

This secret is used as the HMAC key when hashing client IPs for Redis guest vote dedup keys. Without a unique secret, the SHA-256 hashes are reversible via precomputed tables (the IPv4 space is small).

If not set, the application falls back to `"opencan-default-salt"` which provides no meaningful security.
