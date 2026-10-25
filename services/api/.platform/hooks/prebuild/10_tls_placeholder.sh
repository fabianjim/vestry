#!/bin/bash
# nginx won't start if https.conf names missing files, so a fresh instance
# gets a self-signed stand-in until the postdeploy hook links the real cert
set -euo pipefail

crt=/etc/pki/tls/certs/vestry-api.crt
key=/etc/pki/tls/private/vestry-api.key

# -e follows the links, so a dangling one gets replaced too
if [ -e "$crt" ] && [ -e "$key" ]; then
    exit 0
fi

mkdir -p /etc/pki/tls/certs /etc/pki/tls/private
openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=vestry-placeholder" \
    -keyout /etc/pki/tls/private/vestry-api-placeholder.key \
    -out /etc/pki/tls/certs/vestry-api-placeholder.crt
chmod 600 /etc/pki/tls/private/vestry-api-placeholder.key
ln -sfn /etc/pki/tls/certs/vestry-api-placeholder.crt "$crt"
ln -sfn /etc/pki/tls/private/vestry-api-placeholder.key "$key"
