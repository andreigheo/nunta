# ADR 0059: Central outbound HTTP and SSRF defense

Status: accepted

User-influenced server fetches must use `SafeOutboundHttpClient`. It resolves and validates every A/AAAA result, blocks private/reserved/metadata ranges including mapped IPv6, rejects URL credentials, validates every redirect, disables inherited proxies and enforces scheme, hostname allowlist, timeout, response-size and content-type limits. Provider endpoints use explicit allowlists. Direct `fetch` is permitted only for static trusted infrastructure URLs documented in code.
