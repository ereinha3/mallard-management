#!/usr/bin/env bash
# One-time tunnel setup. Run AFTER `cloudflared tunnel login` has authorized
# the mallardmanagement.tech zone (which requires the zone to be Active in
# Cloudflare first). Creates the named tunnel, stores its credentials next to
# this script, and auto-creates the DNS CNAME records for apex + www.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS="$DIR/mallard-creds.json"

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "ERROR: not logged in. Run:  cloudflared tunnel login" >&2
  exit 1
fi

# Create the tunnel only if it doesn't already exist.
if cloudflared tunnel list | grep -qw mallard; then
  echo "Tunnel 'mallard' already exists — skipping create."
else
  cloudflared tunnel create --credentials-file "$CREDS" mallard
fi

# Point the hostnames at the tunnel (creates proxied CNAMEs automatically).
cloudflared tunnel route dns mallard mallardmanagement.tech
cloudflared tunnel route dns mallard www.mallardmanagement.tech

echo
echo "Setup complete. Start the demo with:  deploy/run-demo.sh"
