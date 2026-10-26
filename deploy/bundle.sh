#!/usr/bin/env bash
# builds the elastic beanstalk bundle: deploy/bundle.sh <vestry image> <hindsight image> <out.zip>
set -euo pipefail

vestry_image=$1
hindsight_image=$2
out=$(cd "$(dirname "$3")" && pwd)/$(basename "$3")

# digests, not tags, so a deploy runs exactly the images that were tested
for image in "$vestry_image" "$hindsight_image"; do
  [[ $image == *@sha256:* ]] || { echo "not pinned by digest: $image" >&2; exit 1; }
done

here=$(cd "$(dirname "$0")" && pwd)
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

sed -e "s|__VESTRY_IMAGE__|$vestry_image|" -e "s|__HINDSIGHT_IMAGE__|$hindsight_image|" \
  "$here/docker-compose.yml" > "$staging/docker-compose.yml"
cp "$here/Caddyfile" "$staging/"
cp -R "$here/.ebextensions" "$staging/"
rm -f "$out"
(cd "$staging" && zip -qr "$out" .)
echo "wrote $out"
