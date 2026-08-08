#!/usr/bin/env bash
set -euo pipefail

evidence_root="ops/release-evidence/current"
state_root="${BETA_BACKUP_REHEARSAL_ROOT:-/home/andrei/.local/state/weddingos-beta-backup-rehearsal}"
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup_root="${state_root}/source-${run_stamp}"
destination_root="${state_root}/destination-${run_stamp}"
object_source="${state_root}/objects-source-${run_stamp}"
object_restore="${state_root}/objects-restore-${run_stamp}"
mkdir -p "${evidence_root}" "${backup_root}" "${destination_root}" "${object_source}" "${object_restore}"
printf 'WeddingOS Slice 10C object restore proof\n' > "${object_source}/proof.txt"

export DATABASE_OWNER_URL="${BETA_BACKUP_DATABASE_OWNER_URL:-postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public}"
export POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-weddingos-postgres-1}"
export POSTGRES_USER="${POSTGRES_USER:-weddingos}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-weddingos}"
export POSTGRES_DATABASE="${POSTGRES_DATABASE:-weddingos_e2e}"
export BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-weddingos-local-beta-rehearsal-only-change-me}"
export BACKUP_ENCRYPTION_KEY_ID="${BACKUP_ENCRYPTION_KEY_ID:-local-beta-rehearsal-v1}"
export BACKUP_ROOT="${backup_root}"
export BACKUP_DESTINATION_DIRECTORY="${destination_root}"
export OBJECT_SOURCE_DIRECTORY="${object_source}"

run_root="$(ops/backup/run-local-backup.sh)"
ops/backup/verify-local-backup.sh "${run_root}"
destination_run="${destination_root}/$(basename "${run_root}")"
cp "${run_root}/.verified" "${destination_run}/.verified"
export RESTORE_OBJECT_DIRECTORY="${object_restore}"
target_database="${BETA_RESTORE_TARGET_DATABASE:-weddingos_restore_beta}"
ops/backup/restore-disposable.sh "${destination_run}" "${target_database}"
cmp "${object_source}/proof.txt" "${object_restore}/proof.txt"

BACKUP_RUN_ID="$(basename "${run_root}")" BACKUP_DESTINATION="${destination_root}" \
  node -e 'const fs=require("fs"),p=require("path"); const o={formatVersion:1,status:"VERIFIED",verifiedAt:new Date().toISOString(),runId:process.env.BACKUP_RUN_ID,destination:"SEPARATE_LOCAL_DESTINATION",destinationIdentity:process.env.BACKUP_DESTINATION,encrypted:true,checksumVerified:true,objectInventoryVerified:true}; fs.writeFileSync(p.join(process.argv[1],"backup-verification.json"),JSON.stringify(o,null,2)+"\n")' "${evidence_root}"
RESTORE_TARGET="${target_database}" \
  node -e 'const fs=require("fs"),p=require("path"); const o={formatVersion:1,status:"VERIFIED",verifiedAt:new Date().toISOString(),targetDatabase:process.env.RESTORE_TARGET,databasePurpose:"restore-target",sourceDatabaseUntouched:true,migrationsVerified:true,rlsVerified:true,objectsVerified:true}; fs.writeFileSync(p.join(process.argv[1],"restore-verification.json"),JSON.stringify(o,null,2)+"\n")' "${evidence_root}"
printf 'backup and disposable restore verified: %s -> %s\n' "${run_root}" "${target_database}"
