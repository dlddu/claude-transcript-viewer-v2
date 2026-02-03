#!/bin/bash

# E2E Testing Script for kind (Kubernetes in Docker)
#
# This script automates the setup and execution of E2E tests in a local kind cluster.
# It builds Docker images, loads them into kind, deploys all services, and runs Playwright tests.
#
# Prerequisites: kind, kubectl, docker, pnpm
#
# Usage: ./scripts/e2e-kind.sh [--cleanup]
#   --cleanup    Delete the kind cluster after tests complete

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CLUSTER_NAME="claude-transcript-viewer-e2e"
FRONTEND_IMAGE="frontend:test"
BACKEND_IMAGE="backend:test"

echo -e "${GREEN}=== Claude Transcript Viewer E2E Test Suite ===${NC}"
echo ""

# Check for required tools
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v kind &> /dev/null; then
    echo -e "${RED}Error: kind is not installed${NC}"
    echo "Please install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    echo "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed${NC}"
    echo "Please install docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "Please install pnpm: https://pnpm.io/installation"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites satisfied${NC}"
echo ""

# Check if cluster already exists
echo -e "${YELLOW}Checking for existing kind cluster...${NC}"
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo -e "${GREEN}✓ Using existing cluster: ${CLUSTER_NAME}${NC}"
else
    echo -e "${YELLOW}Creating kind cluster: ${CLUSTER_NAME}${NC}"
    kind create cluster --name "${CLUSTER_NAME}"
    echo -e "${GREEN}✓ Cluster created successfully${NC}"
fi
echo ""

# Build Docker images
echo -e "${YELLOW}Building Docker images...${NC}"

echo "Building frontend image..."
docker build -t "${FRONTEND_IMAGE}" ./frontend

echo "Building backend image..."
docker build -t "${BACKEND_IMAGE}" ./backend

echo -e "${GREEN}✓ Docker images built successfully${NC}"
echo ""

# Load images into kind cluster
echo -e "${YELLOW}Loading Docker images into kind cluster...${NC}"

kind load docker-image "${FRONTEND_IMAGE}" --name "${CLUSTER_NAME}"
kind load docker-image "${BACKEND_IMAGE}" --name "${CLUSTER_NAME}"

echo -e "${GREEN}✓ Images loaded into kind cluster${NC}"
echo ""

# Deploy LocalStack first (infrastructure dependency)
echo -e "${YELLOW}Deploying LocalStack...${NC}"
kubectl apply -f k8s/localstack/

echo -e "${YELLOW}Waiting for LocalStack to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=localstack --timeout=120s

echo -e "${GREEN}✓ LocalStack deployed and ready${NC}"
echo ""

# Create ConfigMaps and Secrets for backend
echo -e "${YELLOW}Creating backend ConfigMap and Secret...${NC}"
kubectl create configmap claude-transcript-viewer-config \
  --from-literal=PORT=3000 \
  --from-literal=AWS_REGION=us-east-1 \
  --from-literal=S3_BUCKET=test-transcripts \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic claude-transcript-viewer-secrets \
  --from-literal=AWS_ACCESS_KEY_ID=test \
  --from-literal=AWS_SECRET_ACCESS_KEY=test \
  --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✓ Backend config created${NC}"
echo ""

# Deploy backend
echo -e "${YELLOW}Deploying backend...${NC}"
kubectl apply -f k8s/backend/

# Override the image to use local test image
kubectl set image deployment/claude-transcript-viewer-backend backend="${BACKEND_IMAGE}"
kubectl set env deployment/claude-transcript-viewer-backend AWS_ENDPOINT_URL=http://localstack:4566

echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=claude-transcript-viewer-backend --timeout=120s

echo -e "${GREEN}✓ Backend deployed and ready${NC}"
echo ""

# Create ConfigMap for frontend
echo -e "${YELLOW}Creating frontend ConfigMap...${NC}"
kubectl create configmap claude-transcript-viewer-frontend-config \
  --from-literal=VITE_API_URL=http://claude-transcript-viewer-backend \
  --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✓ Frontend config created${NC}"
echo ""

# Deploy frontend
echo -e "${YELLOW}Deploying frontend...${NC}"
kubectl apply -f k8s/frontend/

# Override the image to use local test image
kubectl set image deployment/claude-transcript-viewer-frontend frontend="${FRONTEND_IMAGE}"

echo -e "${YELLOW}Waiting for frontend to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=claude-transcript-viewer-frontend --timeout=120s

echo -e "${GREEN}✓ Frontend deployed and ready${NC}"
echo ""

# Setup port-forwarding
echo -e "${YELLOW}Setting up port-forwarding...${NC}"

# Kill any existing port-forwards
pkill -f "kubectl port-forward" || true

# Forward frontend port
kubectl port-forward service/claude-transcript-viewer-frontend 5173:80 &
FRONTEND_PF_PID=$!

# Forward backend port
kubectl port-forward service/claude-transcript-viewer-backend 3000:80 &
BACKEND_PF_PID=$!

# Wait for port-forwards to be established
sleep 5

echo -e "${GREEN}✓ Port-forwarding established${NC}"
echo ""

# Install dependencies and Playwright
echo -e "${YELLOW}Installing dependencies...${NC}"
pnpm install --frozen-lockfile

echo -e "${YELLOW}Installing Playwright browsers...${NC}"
pnpm exec playwright install --with-deps chromium

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Run E2E tests
echo -e "${YELLOW}Running E2E tests...${NC}"
export BASE_URL=http://localhost:5173

if pnpm --filter @claude-transcript-viewer/e2e test; then
    echo -e "${GREEN}✓ E2E tests passed!${NC}"
    TEST_RESULT=0
else
    echo -e "${RED}✗ E2E tests failed${NC}"
    TEST_RESULT=1
fi
echo ""

# Cleanup port-forwards
echo -e "${YELLOW}Stopping port-forwards...${NC}"
kill $FRONTEND_PF_PID $BACKEND_PF_PID 2>/dev/null || true

# Cleanup cluster if requested
if [[ "$1" == "--cleanup" ]]; then
    echo -e "${YELLOW}Cleaning up kind cluster...${NC}"
    kind delete cluster --name "${CLUSTER_NAME}"
    echo -e "${GREEN}✓ Cluster deleted${NC}"
else
    echo -e "${YELLOW}Cluster preserved for debugging. To delete, run:${NC}"
    echo "  kind delete cluster --name ${CLUSTER_NAME}"
fi

echo ""
echo -e "${GREEN}=== E2E Test Suite Complete ===${NC}"

exit $TEST_RESULT
