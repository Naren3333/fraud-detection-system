# Deliverables Proposal

## Module / Team
- Module: ESD
- Team: ESD G05 T05
- Project: Fraud Detection Platform

## 1) Proposed Scenario
This project targets **real-time fraud detection for digital payment transactions**.  
When users submit payments/transfers, the platform evaluates risk using rules + ML scoring, then decides to:
- `APPROVE`
- `DECLINE`
- `FLAG FOR MANUAL REVIEW`

Borderline/high-risk cases are routed to a human verification workflow before final outcome.

## 2) Problem Statement
Financial transaction systems must balance:
- fraud prevention (catch malicious transactions),
- customer experience (avoid false declines),
- operational control (review suspicious cases quickly),
- auditability and traceability (for compliance/governance).

A monolithic synchronous design struggles with scale, resilience, and observability for these needs.

## 3) Scope
### In Scope
- Event-driven transaction processing pipeline
- Fraud scoring (rules + ML scoring service)
- Decision engine with threshold-based outcomes
- Human-in-the-loop review for flagged transactions
- Notification, audit logging, and analytics dashboard
- Observability (metrics + tracing)

### Out of Scope
- Production-grade card network integrations
- Regulatory certification/compliance audits
- Full model lifecycle automation (continuous retraining deployment)

## 4) Users / Stakeholders
- End user (customer): initiates transactions
- Fraud analyst: reviews flagged cases
- Operations / engineering team: monitors service health and latency
- Instructor/evaluator: assesses architecture, implementation quality, and business justification

## 5) Functional Requirements (Draft)
1. Accept transaction requests via API gateway.
2. Persist transaction and publish `transaction.created`.
3. Run fraud analysis (rules + ML score) and publish `transaction.scored`.
4. Produce final decision:
   - `transaction.finalised` for approved/declined
   - `transaction.flagged` for manual review
5. Support analyst decision submission and publish `transaction.reviewed`.
6. Update transaction status based on automated/manual decision.
7. Expose analytics and decision explanation data.
8. Persist audit events for key actions.

## 6) Non-Functional Requirements (Draft)
- Availability: degraded operation when dependent service is unavailable (via retries, DLQ, circuit-breaker patterns where applicable)
- Scalability: asynchronous Kafka-backed event flow and partitioned topics
- Observability: Prometheus metrics, Grafana dashboards, distributed tracing
- Security: JWT-based authentication/authorization across APIs
- Maintainability: microservice boundaries by business capability

## 7) Draft Solution Design
### 7.1 High-Level Architecture
- API Gateway as edge entrypoint
- Core services:
  - user-service
  - transaction-service
  - fraud-detection-service
  - ml-scoring-service
  - decision-engine-service
  - human-verification-service
  - notification-service
  - analytics-service
  - audit-service
- Messaging backbone: Kafka
- Datastores: PostgreSQL per domain + Redis for cache/rate-limit/velocity use
- Observability stack: Prometheus + Grafana + OpenTelemetry + Jaeger

### 7.2 Key Event Topics
- `transaction.created`
- `transaction.scored`
- `transaction.finalised`
- `transaction.flagged`
- `transaction.reviewed`
- DLQ topics for fault isolation

### 7.3 Core Decision Logic (Current)
- Rule and ML outputs contribute to risk score/fraud indicators
- Decision engine applies:
  - list overrides (whitelist/blacklist)
  - high-value/geographic manual-review rules
  - threshold bands for approve/flag/decline
- Manual review can override flagged decisions to final approve/decline

## 8) Main Use-Case Flow (Draft)
1. Client submits transfer via API Gateway.
2. transaction-service stores transaction and emits `transaction.created`.
3. fraud-detection-service enriches with rule/ML analysis and emits `transaction.scored`.
4. decision-engine-service decides:
   - approved/declined -> emits `transaction.finalised`
   - flagged -> emits `transaction.flagged`
5. human-verification-service consumes flagged items for analyst review.
6. Analyst submits decision -> `transaction.reviewed`.
7. transaction-service updates final status.
8. analytics-service/dashboard and notification-service reflect outcomes.

## 9) Data / Explainability
Decision records include:
- risk score, ML score, rule score
- decision reason text
- decision factors (JSON)
- override metadata

Demo UI includes decision explainability panel showing:
- decision and scores
- top reasons
- manual-review trigger type
- manual-review metadata

## 10) Validation Plan
### Technical Validation
- End-to-end API + Kafka flow via provided test collection
- Health and metrics endpoint checks
- Dashboard consistency checks (decision counts/rates)

### Model Evaluation
Offline evaluation artifacts generated from synthetic dataset:
- precision, recall, F1, ROC-AUC
- confusion matrix
- threshold tradeoff table
- approve/flag/decline impact table

Artifacts:
- `ml-scoring-service/data/models/latest/evaluation.md`
- `ml-scoring-service/data/models/latest/evaluation.json`

## 11) Risks and Mitigations (Draft)
1. Service/network failure in async chain  
Mitigation: topic-level retries, DLQ, idempotent consumers where applicable.

2. False positives causing user friction  
Mitigation: manual review path, threshold tuning, evaluation tradeoff analysis.

3. Data drift/model performance degradation  
Mitigation: periodic offline re-evaluation and threshold review.

## 12) Milestone Plan (High-Level)
1. Architecture skeleton + infrastructure setup
2. Core event flow implementation
3. Fraud + decision logic integration
4. Human review + analytics + notifications
5. Observability, testing, and demo hardening

## 13) Expected Deliverables for Week 9 Discussion
1. Scenario definition and rationale
2. Draft architecture with service boundaries and event flow
3. Key functional/non-functional requirements
4. Risks/tradeoffs and initial mitigation strategy
5. Demo narrative for instructor discussion