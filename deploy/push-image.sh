#!/usr/bin/env bash
# builds and pushes one arm64 image tagged with its commit; used by both repos' ci.
# deploy/push-image.sh <ecr repo> <build context> <dockerfile> <commit sha>
set -euo pipefail

repo=$1
context=$2
dockerfile=$3
tag=${4:0:12}
registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${AWS_REGION:-us-east-1}.amazonaws.com

aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
# tags are immutable, so a rerun of the same commit reuses its image
if aws ecr describe-images --repository-name "$repo" --image-ids imageTag="$tag" >/dev/null 2>&1; then
  echo "$repo:$tag is already pushed"
  exit 0
fi
docker build --platform linux/arm64 --file "$dockerfile" --tag "$registry/$repo:$tag" "$context"
docker push "$registry/$repo:$tag"
