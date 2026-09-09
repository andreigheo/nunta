process.env["NODE_ENV"] ??= "test";
process.env["WEB_URL"] ??= "http://127.0.0.1:3000";
process.env["API_URL"] ??= "http://127.0.0.1:4000";
process.env["PORT"] ??= "4000";
process.env["DATABASE_URL"] ??=
  "postgresql://weddingos_app:weddingos_app@127.0.0.1:54339/weddingos_integration?schema=public";
process.env["DATABASE_OWNER_URL"] ??=
  "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_integration?schema=public";
process.env["DATABASE_PURPOSE"] ??= "integration";
process.env["SESSION_SECRET"] ??=
  "test-session-secret-with-at-least-32-characters";
process.env["SESSION_COOKIE_NAME"] ??= "weddingos_session";
process.env["EMAIL_FROM"] ??= "Sarbato <no-reply@sarbato.local>";
process.env["EMAIL_PROVIDER"] ??= "smtp";
process.env["SMTP_HOST"] ??= "127.0.0.1";
process.env["SMTP_PORT"] ??= "1025";
process.env["REDIS_URL"] ??= "redis://127.0.0.1:56379/14";
process.env["OUTBOX_ENCRYPTION_KEY"] ??=
  "weddingos-local-outbox-encryption-key-change-production";
process.env["GUEST_ACCESS_TOKEN_SECRET"] ??=
  "weddingos-local-guest-access-token-secret-change-production";
process.env["WORKER_STALE_AFTER_SECONDS"] ??= "45";
process.env["LOG_LEVEL"] ??= "silent";
process.env["FEATURE_MAGIC_LINK_ENABLED"] ??= "true";
process.env["FEATURE_MFA_ENABLED"] ??= "false";
process.env["CSRF_ENFORCEMENT"] ??= "false";
process.env["OBJECT_STORAGE_PROVIDER"] ??= "minio";
process.env["OBJECT_STORAGE_ENDPOINT"] ??= "http://127.0.0.1:59000";
process.env["OBJECT_STORAGE_PUBLIC_ENDPOINT"] ??= "http://127.0.0.1:59000";
process.env["OBJECT_STORAGE_REGION"] ??= "us-east-1";
process.env["OBJECT_STORAGE_BUCKET"] ??= "weddingos-integration";
process.env["OBJECT_STORAGE_ACCESS_KEY"] ??= "weddingos";
process.env["OBJECT_STORAGE_SECRET_KEY"] ??= "weddingos-local-storage-secret";
process.env["OBJECT_STORAGE_FORCE_PATH_STYLE"] ??= "true";
process.env["CLAMAV_HOST"] ??= "127.0.0.1";
process.env["CLAMAV_PORT"] ??= "53310";
process.env["SIGNATURE_PROVIDER"] ??= "fake";
process.env["SIGNATURE_PROVIDER_SECRET"] ??= "weddingos-signature-local-secret";
process.env["PAYMENT_PROVIDER"] ??= "fake";
process.env["PAYMENT_PROVIDER_SECRET"] ??= "weddingos-payment-local-secret";
process.env["SUBSCRIPTION_PROVIDER"] ??= "fake";
process.env["SUBSCRIPTION_PROVIDER_SECRET"] ??=
  "weddingos-subscription-local-secret";
process.env["PAYOUT_PROVIDER"] ??= "fake";
process.env["PAYOUT_PROVIDER_SECRET"] ??= "weddingos-payout-local-secret";
