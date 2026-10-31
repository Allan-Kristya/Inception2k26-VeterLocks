#!/bin/sh
set -eu
printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 32)"
printf 'POSTGRES_RUNTIME_PASSWORD=%s\n' "$(openssl rand -hex 32)"
printf 'AI_SERVICE_TOKEN=%s\n' "$(openssl rand -hex 32)"
python - <<'PY'
from cryptography.fernet import Fernet
print("WEBHOOK_ENCRYPTION_KEY=" + Fernet.generate_key().decode())
PY
