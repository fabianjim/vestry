#!/usr/bin/env bash
# deploys the newest vestry-api and hindsight images to elastic beanstalk; used by both repos' ci.
# deploy/deploy.sh <description>
set -euo pipefail

app=portfolio-monitor-api
environment=vestry-api-env
region=${AWS_REGION:-us-east-1}
registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$region.amazonaws.com
here=$(cd "$(dirname "$0")" && pwd)

# only main pushes reach ecr, so the newest tagged image of each repo is what should run
newest() {
  aws ecr describe-images --repository-name "$1" --filter tagStatus=TAGGED \
    --query 'sort_by(imageDetails, &imagePushedAt)[-1].imageDigest' --output text
}

environment_state() {
  aws elasticbeanstalk describe-environments --environment-names "$environment" \
    --query 'Environments[0].[Status, Health]' --output text
}

# the other repo may be deploying; wait instead of failing on a busy environment
wait_until_ready() {
  for _ in $(seq 1 120); do
    [[ $(environment_state) == Ready* ]] && return 0
    sleep 10
  done
  echo "environment never became ready: $(environment_state)" >&2
  exit 1
}

vestry=$registry/vestry-api@$(newest vestry-api)
hindsight=$registry/hindsight@$(newest hindsight)
label=compose-$(date -u +%Y%m%d-%H%M%S)
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

"$here/bundle.sh" "$vestry" "$hindsight" "$staging/deploy.zip"
bucket=$(aws elasticbeanstalk create-storage-location --query S3Bucket --output text)
aws s3 cp "$staging/deploy.zip" "s3://$bucket/$app/$label.zip" --only-show-errors
aws elasticbeanstalk create-application-version --application-name "$app" --version-label "$label" \
  --description "${1:-deploy}" --source-bundle "S3Bucket=$bucket,S3Key=$app/$label.zip" --process >/dev/null

wait_until_ready
aws elasticbeanstalk update-environment --environment-name "$environment" --version-label "$label" >/dev/null
sleep 20
wait_until_ready

health=$(environment_state)
deployed=$(aws elasticbeanstalk describe-environments --environment-names "$environment" \
  --query 'Environments[0].VersionLabel' --output text)
[[ $deployed == "$label" && $health == *Green ]] || { echo "deploy failed: $deployed, $health" >&2; exit 1; }
for _ in $(seq 1 12); do
  [[ $(curl -s -o /dev/null -w '%{http_code}' https://api.vestry.me/api/auth/me) == 401 ]] && { echo "deployed $label"; exit 0; }
  sleep 10
done
echo "api.vestry.me is not answering after the deploy" >&2
exit 1
