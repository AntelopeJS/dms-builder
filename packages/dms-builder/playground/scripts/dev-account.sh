#!/usr/bin/env bash
# A test account for the playground, owner of its workspace, made once: whoever
# drives the browser — an agent included — signs in with it instead of with
# someone's own password. Its credentials land in `.dev-login.json` (ignored by
# git), read back by whoever signs in.
#
# Run inside the devbox container, next to the playground's MongoDB, with the
# backend up:
#   docker exec -u dev devbox bash -lc \
#     '/home/dev/antelopejs/dms-builder/packages/dms-builder/playground/scripts/dev-account.sh'
#
# The account goes through the DMS's own invitation: an invite row for the
# workspace, as owner, then the signup that accepts it — the password is hashed
# and the membership written the way the DMS writes them.
set -euo pipefail

cd "$(dirname "$0")/.."
FILE=.dev-login.json
API="${DMS_API_URL:-http://localhost:5010}"
DB="${PLAYGROUND_DB:-dms_builder_playground}"
TENANT="${PLAYGROUND_TENANT:-default}"

signs_in() {
	local email password
	email=$(sed -n 's/.*"email": *"\([^"]*\)".*/\1/p' "$FILE")
	password=$(sed -n 's/.*"password": *"\([^"]*\)".*/\1/p' "$FILE")
	curl -fsS -o /dev/null -X POST "$API/api/auth/login" \
		-H 'content-type: application/json' \
		-d "{\"email\":\"$email\",\"password\":\"$password\"}"
}

if [ -f "$FILE" ] && signs_in; then
	echo "The test account in $FILE still signs in."
	exit 0
fi

SUFFIX=$(openssl rand -hex 3)
EMAIL="builder-test-$SUFFIX@playground.test"
# Letters and digits, then one of each class the DMS's password policy asks for.
PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 18)A1@"
TOKEN=$(openssl rand -hex 24)

mongosh --quiet "$DB" --eval "
db['dms-tenant__user_invites'].insertOne({
	_id: '$(openssl rand -hex 12)',
	createdAt: new Date(),
	email: '$EMAIL',
	firstname: 'Builder',
	lastname: 'Test',
	roles_ids: [],
	language: 'en',
	token: '$TOKEN',
	asTenantOwner: true,
	expiresAt: new Date(Date.now() + 60 * 60 * 1000),
	skipEmailValidation: true,
	invitedBy: null,
	extensions: null,
	_instance: '$TENANT',
	_internal: { meta: {}, data: {} },
})" >/dev/null

curl -fsS -o /dev/null -X POST "$API/api/auth/signup" \
	-H 'content-type: application/json' \
	-d "{\"name\":\"Builder Test\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"token\":\"$TOKEN\"}"

umask 077
printf '{\n  "email": "%s",\n  "password": "%s"\n}\n' "$EMAIL" "$PASSWORD" >"$FILE"

if signs_in; then
	echo "Test account $EMAIL created, owner of the workspace; credentials in $FILE."
else
	echo "The account was created but does not sign in: see the backend log." >&2
	exit 1
fi
