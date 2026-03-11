# Core Kubernetes Deployment

This folder contains a minimal but real Kubernetes deployment for the Fraud Detection Platform.

It is intentionally smaller than the full Docker Compose stack. The goal is to show a clean, demoable Kubernetes story for a solo project without dragging every supporting service into the first cluster rollout.

## What This Deploys

- `api-gateway`
- `user-service` with `user-db`
- `transaction-service` with `transaction-db`
- `fraud-detection-service`
- `ml-scoring-service`
- `decision-engine-service` with `decision-db`
- `redis`
- `kafka`
- `zookeeper`
- `kafka-init` job for topic creation

This gives you the auth edge plus the async fraud pipeline:

1. Register or log in through `api-gateway`.
2. Create a transaction through `transaction-service`.
3. `transaction-service` writes the transaction and emits `transaction.created`.
4. `fraud-detection-service` consumes that event, applies fraud rules, calls `ml-scoring-service`, and emits `transaction.scored`.
5. `decision-engine-service` consumes `transaction.scored`, persists the decision, and emits `transaction.finalised` or `transaction.flagged`.
6. `transaction-service` consumes the decision event and updates transaction status.

## What This Leaves Out

These services stay on the full Compose stack for now:

- `notification-service`
- `audit-service`
- `analytics-service`
- `human-verification-service`
- `appeal-service`
- Prometheus, Grafana, Jaeger, and the OpenTelemetry collector

That keeps the Kubernetes version focused on the critical payment-to-decision flow while the Compose stack remains the full platform environment.

## Prerequisites

- Docker Desktop with Kubernetes enabled
- `kubectl`
- Local images built from this repo

For Docker Desktop Kubernetes, the easiest local workflow is:

```bash
docker compose build api-gateway user-service transaction-service fraud-detection-service ml-scoring-service decision-engine-service
```

If you use a different cluster type, you may need to push or load the images manually.

## Apply The Core Stack

Review the development placeholder secrets first:

- `k8s/core/platform-secret.yaml`

Then apply everything:

```bash
kubectl apply -k k8s/core
```

Wait for the topic bootstrap job and the app pods:

```bash
kubectl wait --for=condition=complete job/kafka-init -n fraud-detection-core --timeout=180s
kubectl get pods -n fraud-detection-core
```

If you reset Kafka volumes and need to recreate topics, rerun the job:

```bash
kubectl delete job kafka-init -n fraud-detection-core
kubectl apply -f k8s/core/kafka-init-job.yaml -n fraud-detection-core
```

## Access The Gateway

Port-forward the gateway:

```bash
kubectl port-forward svc/api-gateway 3000:3000 -n fraud-detection-core
```

Useful URLs after port-forwarding:

- Gateway: `http://localhost:3000`
- API docs: `http://localhost:3000/api-docs`
- Gateway health: `http://localhost:3000/api/v1/health`

## Demo Flow

The simplest demo story is:

1. Register a user.
2. Log in and capture the JWT.
3. Submit a transaction.
4. Poll the decision endpoint until the async decision is available.

This is enough to show:

- Kubernetes Deployments and Services
- Secrets and ConfigMaps
- Persistent volumes for Kafka, Redis, and PostgreSQL
- Service-to-service communication
- Async event processing with Kafka
- A realistic microservices workflow instead of a single-container demo

## Resume Framing

This deployment lets you say the project is:

- developed locally with Docker Compose
- deployed on Kubernetes for the core fraud pipeline
- designed around microservices, async messaging, persistence, and service discovery

That is usually a stronger portfolio story than forcing every supporting service into the first Kubernetes version.
