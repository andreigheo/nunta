# Incident response

Classify incidents as SEV-1 (security/data loss or platform outage), SEV-2 (major degraded workflow), or SEV-3 (contained defect). Open `PlatformIncident`, assign an incident commander, start a timeline and preserve evidence. For security events, rotate affected credentials, revoke sessions/grants and isolate compromised providers without deleting audit data. For privacy impact, involve the privacy owner and record notification-decision evidence; do not make unsupported legal claims.

Communicate known facts, user impact and the next update time. Do not expose raw secrets, payment payloads or personal data. Recovery follows the disaster-recovery runbook. Close only after service validation, monitoring stability and owner approval; complete a blameless follow-up with actions, owners and due dates.
