#!/bin/sh
set -eu

environment_file=/etc/sarbato-production.env
smtp_password_file=/etc/sarbato-resend-smtp-password
tls_directory=/etc/sarbato/redis-tls

if [ ! -s "$smtp_password_file" ]; then
  echo "Missing Resend sending-only key: $smtp_password_file" >&2
  exit 1
fi

if [ ! -e "$environment_file" ]; then
  umask 077
  postgres_admin_password="$(openssl rand -hex 24)"
  postgres_app_password="$(openssl rand -hex 24)"
  postgres_worker_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  storage_access_key="sarbato$(openssl rand -hex 8)"
  storage_secret_key="$(openssl rand -hex 32)"
  session_secret="$(openssl rand -hex 48)"
  mfa_encryption_key="$(openssl rand -hex 48)"
  outbox_encryption_key="$(openssl rand -hex 48)"
  metrics_token="$(openssl rand -hex 32)"
  resend_smtp_password="$(cat "$smtp_password_file")"

  {
    printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$postgres_admin_password"
    printf 'POSTGRES_APP_PASSWORD=%s\n' "$postgres_app_password"
    printf 'POSTGRES_WORKER_PASSWORD=%s\n' "$postgres_worker_password"
    printf 'REDIS_PASSWORD=%s\n' "$redis_password"
    printf 'STORAGE_ACCESS_KEY=%s\n' "$storage_access_key"
    printf 'STORAGE_SECRET_KEY=%s\n' "$storage_secret_key"
    printf 'SESSION_SECRET=%s\n' "$session_secret"
    printf 'MFA_ENCRYPTION_KEY=%s\n' "$mfa_encryption_key"
    printf 'OUTBOX_ENCRYPTION_KEY=%s\n' "$outbox_encryption_key"
    printf 'METRICS_TOKEN=%s\n' "$metrics_token"
    printf 'RESEND_SMTP_PASSWORD=%s\n' "$resend_smtp_password"
  } > "$environment_file"
  chmod 600 "$environment_file"
fi

if [ ! -s "$tls_directory/server.crt" ]; then
  umask 077
  mkdir -p "$tls_directory"
  openssl req \
    -x509 \
    -newkey rsa:3072 \
    -nodes \
    -days 3650 \
    -subj "/CN=Sarbato Redis CA" \
    -keyout "$tls_directory/ca.key" \
    -out "$tls_directory/ca.crt"
  openssl req \
    -newkey rsa:3072 \
    -nodes \
    -subj "/CN=redis" \
    -addext "subjectAltName=DNS:redis" \
    -keyout "$tls_directory/server.key" \
    -out "$tls_directory/server.csr"
  openssl x509 \
    -req \
    -days 825 \
    -in "$tls_directory/server.csr" \
    -CA "$tls_directory/ca.crt" \
    -CAkey "$tls_directory/ca.key" \
    -CAcreateserial \
    -copy_extensions copy \
    -out "$tls_directory/server.crt"
  chown root:1000 "$tls_directory" "$tls_directory/server.key"
  chmod 750 "$tls_directory"
  chmod 600 "$tls_directory/ca.key"
  chmod 640 "$tls_directory/server.key"
  chmod 644 "$tls_directory/ca.crt" "$tls_directory/server.crt"
fi

printf 'Production secrets and Redis TLS material are present.\n'
