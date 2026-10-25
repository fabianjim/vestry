#!/bin/bash
# gets or keeps the let's encrypt cert and points nginx at it.
# never fails the deploy: on any error nginx keeps the placeholder and http works as before
set -uo pipefail

domain=api.vestry.me
webroot=/var/www/letsencrypt
live=/etc/letsencrypt/live/$domain

setup() {
    rpm -q certbot >/dev/null || dnf install -y certbot || return 1
    mkdir -p "$webroot"
    # keep-until-expiring: redeploys reuse the cert instead of requesting a new one
    certbot certonly --webroot -w "$webroot" -d "$domain" \
        --non-interactive --agree-tos --register-unsafely-without-email \
        --keep-until-expiring || return 1

    ln -sfn "$live/fullchain.pem" /etc/pki/tls/certs/vestry-api.crt
    ln -sfn "$live/privkey.pem" /etc/pki/tls/private/vestry-api.key

    # the package's timer renews; this makes nginx pick up the renewed cert
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/bash\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    systemctl enable --now certbot-renew.timer || return 1

    nginx -t && systemctl reload nginx
}

if ! setup; then
    echo "https: certificate setup failed, nginx keeps the placeholder" >&2
fi
exit 0
