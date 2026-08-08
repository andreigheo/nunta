# ADR 0065: Socket-pinned outbound HTTP

Status: accepted

Every user-influenced or configured provider URL is normalized, allowlisted where applicable, resolved and checked against the complete private/reserved/metadata denylist. The HTTP connector receives only an approved IP and retains the original hostname for `Host` and TLS SNI/certificate verification, preventing a second uncontrolled DNS lookup. Redirects repeat the full resolution and pinning process. Proxy inheritance, TLS-verification bypass, unbounded bodies, unsupported content types and redirect loops are forbidden. Deterministic IPv4/IPv6 rebinding fixtures prove the socket destination.
