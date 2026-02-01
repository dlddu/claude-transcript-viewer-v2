#!/bin/bash

# Development script for Claude Transcript Viewer
# Starts both frontend and backend servers concurrently

set -e

echo "Starting Claude Transcript Viewer development servers..."

# Check if node_modules exist
if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install --workspace=frontend
fi

if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  npm install --workspace=backend
fi

# Start backend in background
echo "Starting backend server on port 3000..."
cd backend
npm start &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 2

# Start frontend in background
echo "Starting frontend server on port 5173..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=================================="
echo "Development servers running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000"
echo "=================================="
echo ""
echo "Press Ctrl+C to stop all servers"

# Trap Ctrl+C and cleanup
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Wait for both processes
wait
