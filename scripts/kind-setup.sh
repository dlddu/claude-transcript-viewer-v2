#!/bin/bash


set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_step() {
  echo -e "${GREEN}==>${NC} $1"
}

echo_error() {
  echo -e "${RED}Error:${NC} $1"
}

echo_warning() {
  echo -e "${YELLOW}Warning:${NC} $1"
}

echo_step "Checking prerequisites..."

if ! command -v kind &> /dev/null; then
  echo_error "kind is not installed. Please install from https://kind.sigs.k8s.io/"
  exit 1
fi

if ! command -v kubectl &> /dev/null; then
  echo_error "kubectl is not installed. Please install from https://kubernetes.io/docs/tasks/tools/"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo_error "docker is not installed. Please install from https://docs.docker.com/get-docker/"
  exit 1
fi

if ! command -v pnpm &> /dev/null; then
  echo_error "pnpm is not installed. Please install from https://pnpm.io/installation"
  exit 1
fi

echo_step "All prerequisites are installed"

CLUSTER_NAME="claude-transcript-viewer"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
KIND_CONFIG="$SCRIPT_DIR/kind-config.yaml"
APP_IMAGE="claude-transcript-viewer:local"

echo_step "Creating kind cluster: $CLUSTER_NAME"

if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo_warning "Cluster $CLUSTER_NAME already exists. To recreate, run: kind delete cluster --name $CLUSTER_NAME"
else
  kind create cluster --name "$CLUSTER_NAME" --config "$KIND_CONFIG"
  echo_step "Kind cluster created successfully"
fi

echo_step "Building application Docker image (API + static frontend)..."

cd "$REPO_ROOT"
docker build -t "$APP_IMAGE" -f Dockerfile .

echo_step "Loading application image into kind cluster..."
kind load docker-image "$APP_IMAGE" --name "$CLUSTER_NAME"

echo_step "Loading LocalStack image into kind cluster..."
docker pull localstack/localstack:3.0
kind load docker-image localstack/localstack:3.0 --name "$CLUSTER_NAME"

echo_step "Deploying LocalStack to kind cluster..."
kubectl apply -f "$REPO_ROOT/k8s/localstack/"

# AWS_PUBLIC_ENDPOINT_URL makes presigned URLs resolve for the browser via
# the port-forwarded LocalStack (kubectl port-forward svc/localstack 4566:4566).
echo_step "Creating app ConfigMap and Secret for LocalStack..."
kubectl create configmap claude-transcript-viewer-config \
  --from-literal=PORT=3000 \
  --from-literal=AWS_REGION=us-east-1 \
  --from-literal=S3_BUCKET=test-transcripts \
  --from-literal=AWS_ENDPOINT_URL=http://localstack:4566 \
  --from-literal=AWS_PUBLIC_ENDPOINT_URL=http://localhost:4566 \
  --dry-run=client -o yaml | kubectl apply -f -

# Credentials only — LocalStack has no IRSA. Settings live in the ConfigMap.
kubectl create secret generic claude-transcript-viewer-secrets \
  --from-literal=AWS_ACCESS_KEY_ID=test \
  --from-literal=AWS_SECRET_ACCESS_KEY=test \
  --dry-run=client -o yaml | kubectl apply -f -

echo_step "Deploying application to kind cluster..."
kubectl apply -f "$REPO_ROOT/k8s/app/pvc.yaml"
kubectl apply -f "$REPO_ROOT/k8s/app/deployment.yaml"
kubectl apply -f "$REPO_ROOT/k8s/app/service.yaml"

kubectl set image deployment/claude-transcript-viewer app="$APP_IMAGE"
kubectl patch deployment claude-transcript-viewer --type=json \
  -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/imagePullPolicy", "value": "IfNotPresent"}]'

echo_step "Waiting for deployments to be ready..."

kubectl wait --for=condition=ready pod -l app=localstack --timeout=120s || true
kubectl rollout status deployment/localstack --timeout=120s || true

kubectl wait --for=condition=ready pod -l app=claude-transcript-viewer --timeout=120s || true
kubectl rollout status deployment/claude-transcript-viewer --timeout=120s || true

echo_step "Setting up S3 bucket in LocalStack..."

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566

sleep 5

kubectl port-forward svc/localstack 4566:4566 &
PORT_FORWARD_PID=$!
sleep 2

echo_step "Creating S3 bucket..."
if command -v aws &> /dev/null; then
  aws --endpoint-url "$AWS_ENDPOINT_URL" s3 mb s3://test-transcripts 2>/dev/null || echo "Bucket may already exist"
else
  echo_warning "AWS CLI not installed, skipping S3 bucket creation"
fi

kill $PORT_FORWARD_PID 2>/dev/null || true

echo_step "Kind cluster setup complete!"
echo ""
echo "Cluster Information:"
echo "  Name: $CLUSTER_NAME"
echo "  Context: kind-$CLUSTER_NAME"
echo ""
echo "To access the application (frontend + API from one service):"
echo "  kubectl port-forward svc/claude-transcript-viewer 8080:80"
echo "  Then open http://localhost:8080 in your browser"
echo "  The backend API is served from the same origin at http://localhost:8080/api"
echo ""
echo "  LocalStack: kubectl port-forward svc/localstack 4566:4566"
echo "              AWS_ENDPOINT_URL=http://localhost:4566"
echo "              Keep this port-forward running while browsing transcripts:"
echo "              the browser downloads them from presigned localhost:4566 URLs"
echo ""
echo "To seed test transcripts (fixtures) into LocalStack + SQLite:"
echo "  pod=\$(kubectl get pod -l app=claude-transcript-viewer -o jsonpath='{.items[0].metadata.name}')"
echo "  kubectl cp e2e/fixtures \"\$pod:/tmp/fixtures\""
echo "  kubectl exec \"\$pod\" -- /usr/local/bin/server seed --dir /tmp/fixtures"
echo ""
echo "To view logs:"
echo "  kubectl logs -l app=claude-transcript-viewer"
echo "  kubectl logs -l app=localstack"
echo ""
echo "To delete the cluster:"
echo "  kind delete cluster --name $CLUSTER_NAME"
