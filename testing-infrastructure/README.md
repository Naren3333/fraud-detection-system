# Testing Infrastructure Overview

## Testing Pyramid

```
                    ▲
                   / \
                  /   \
                 /     \
                / E2E   \           ~10 tests  (minutes)
               /_________\
              /           \
             / Integration \        ~100 tests (seconds)
            /_______________\
           /                 \
          /   Unit Tests      \    ~1000 tests (milliseconds)
         /_____________________\
```

## Test Distribution (Ideal)

- **70%** Unit Tests — Fast, isolated, test business logic
- **20%** Integration Tests — API contracts, database interactions
- **10%** E2E Tests — Full user flows, critical paths

## Test Types We'll Implement

1. **Unit Tests** (Jest) — Service logic, utilities, models
2. **Integration Tests** (Supertest) — API endpoints, database
3. **E2E Tests** (Playwright) — Full transaction flows
4. **Load Tests** (k6) — Performance under stress
5. **Security Tests** (OWASP ZAP) — Vulnerability scanning
6. **Contract Tests** (Pact) — Microservice contracts
7. **Smoke Tests** — Quick health checks post-deployment

## Coverage Goals

| Metric                 | Target               |
| ---------------------- | -------------------- |
| Code Coverage          | ≥85%                 |
| Branch Coverage        | ≥80%                 |
| API Coverage           | 100% (all endpoints) |
| Critical Path Coverage | 100%                 |

## Test Execution Times

| Test Type   | Target Time | Frequency    |
| ----------- | ----------- | ------------ |
| Unit        | <5 seconds  | Every commit |
| Integration | <30 seconds | Every commit |
| E2E         | <5 minutes  | Pre-merge    |
| Load        | <10 minutes | Nightly      |
| Security    | <15 minutes | Weekly       |

## CI/CD Pipeline Stages

```
┌─────────────┐
│ Code Commit │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Lint & Type │
│   Check     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Unit Tests  │  ← Fast feedback (5s)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Integration │  ← API validation (30s)
│    Tests    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Build Docker│
│   Images    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  E2E Tests  │  ← Full flows (5m)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │
│   Staging   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Smoke Tests │  ← Post-deploy (1m)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │
│ Production  │
└─────────────┘
```

## Directory Structure

```
testing-infrastructure/
├── README.md                    # This file
├── jest.config.js              # Jest configuration
├── docker/docker-compose.test.yml # Test infrastructure
│
├── unit/                       # Unit tests
│   ├── services/
│   ├── utils/
│   └── models/
│
├── integration/                # Integration tests
│   ├── api/
│   ├── database/
│   └── kafka/
│
├── e2e/                        # End-to-end tests
│   ├── transaction-flow.spec.js
│   ├── fraud-detection.spec.js
│   └── admin-dashboard.spec.js
│
├── load/                       # Load tests
│   ├── transaction-load.js
│   ├── api-gateway-load.js
│   └── scenarios/
│
├── security/                   # Security tests
│   ├── owasp-zap-scan.js
│   ├── sql-injection.test.js
│   └── xss.test.js
│
├── contract/                   # Contract tests
│   ├── pacts/
│   └── consumer-tests/
│
├── ci/                         # CI/CD configs
│   ├── github-actions/
│   ├── gitlab-ci/
│   └── jenkins/
│
├── fixtures/                   # Test data
│   ├── transactions.json
│   ├── users.json
│   └── fraud-patterns.json
│
├── helpers/                    # Test utilities
│   ├── test-db.js
│   ├── test-kafka.js
│   └── test-auth.js
│
└── reports/                    # Test reports
    ├── coverage/
    ├── load/
    └── security/
```

## Quick Start

```bash
# Install dependencies
npm install --save-dev jest supertest playwright k6 @pact-foundation/pact

# Run all unit tests
npm run test:unit

# Run integration tests (requires Docker)
docker compose -f docker/docker-compose.test.yml up -d
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run load tests
npm run test:load

# Run full test suite
npm run test:all

# Generate coverage report
npm run test:unit:coverage
```

## Environment Variables for Testing

```bash
# .env.test
NODE_ENV=test
API_GATEWAY_URL=http://localhost:3000
TEST_DB_HOST=localhost
TEST_DB_PORT=5433  # Different from prod
TEST_KAFKA_BROKERS=localhost:9093
TEST_REDIS_PORT=6380
```

## Test Data Management

### Fixtures

Pre-defined test data stored in `fixtures/` directory.

### Factories

Generate dynamic test data:

```javascript
const user = userFactory.build({ email: "test@example.com" });
const transaction = transactionFactory.build({ amount: 1000 });
```

### Database Seeding

Seed test database with known data:

```bash
npm run test:seed
```

### Data Cleanup

Clean up after each test:

```javascript
afterEach(async () => {
  await testDb.cleanup();
});
```

## Continuous Integration

### GitHub Actions (Recommended)

- Workflow file: `.github/workflows/ci-cd.yml`
- Runs lint/format/unit tests on PRs and pushes to `develop`/`main`
- Optional full integration+e2e via manual dispatch (`run_full_suite=true`)
- Auto-deploys:
  - `develop` -> staging
  - `main` -> production
- Supports manual deploy target selection and rollback by git ref

### Required GitHub Secrets

- `DEPLOY_REPO_TOKEN` (repo read token for target server git pull)
- `DEPLOY_APP_DIR` (optional, default `/opt/fraud-detection-system`)
- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_KEY`
- `STAGING_SSH_PORT` (optional, default `22`)
- `STAGING_HEALTHCHECK_URL` (example: `https://staging.example.com/api/v1/health`)
- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_KEY`
- `PROD_SSH_PORT` (optional, default `22`)
- `PROD_HEALTHCHECK_URL` (example: `https://api.example.com/api/v1/health`)

### Required GitHub Environments

- `staging` (recommended: required reviewers)
- `production` (required reviewers strongly recommended)

### Manual Operations

1. Run full test suite:
   - Actions -> `CI` -> `Run workflow`
   - `run_full_suite=true`
2. Manual deploy:
   - Actions -> `CI` -> `Run workflow`
   - `deploy_env=staging` or `deploy_env=production`
3. Rollback:
   - Actions -> `CI` -> `Run workflow`
   - set `deploy_env`
   - set `rollback_ref` to previous tag/commit

### CI/CD Runbook (Step-by-Step)

1. One-time GitHub setup:
   - Go to `Settings -> Environments`
   - Create `staging` and `production`
   - Add required reviewers (at least for `production`)
   - Go to `Settings -> Secrets and variables -> Actions`
   - Add all secrets listed in `Required GitHub Secrets`
2. One-time server setup (staging/prod hosts):
   - Install `docker`, `docker compose`, and `git`
   - Ensure SSH user from secrets can access deploy path
   - Ensure deploy path is writable (default `/opt/fraud-detection-system`)
   - Ensure healthcheck URL is reachable from GitHub runner
3. Daily development flow:
   - Create PR to `develop` or `main`
   - CI runs automatically: lint, format, unit tests
   - Fix failures, then merge when green
4. Automatic deployment flow:
   - Merge/push to `develop` -> deploys to `staging`
   - Merge/push to `main` -> deploys to `production`
   - Workflow runs smoke test after each deploy using configured healthcheck URL
5. Manual full-suite test flow:
   - `Actions -> CI -> Run workflow`
   - Set `run_full_suite=true`
   - Use this before high-risk releases
6. Manual deploy flow:
   - `Actions -> CI -> Run workflow`
   - Set `deploy_env=staging` or `deploy_env=production`
   - Leave `rollback_ref` empty for normal deploy
7. Rollback flow:
   - `Actions -> CI -> Run workflow`
   - Set `deploy_env`
   - Set `rollback_ref` to a known good commit SHA or tag
   - Confirm smoke test passes after rollback

### What Success Looks Like

- `quality` job is green on PR/push
- `deploy-staging` green after merge to `develop`
- `deploy-production` green after merge to `main`
- Service health endpoint returns HTTP 200 after deploy

### Common Failure Points

- Missing/incorrect SSH secrets
- Server missing `docker compose` plugin
- Invalid `DEPLOY_REPO_TOKEN` permissions
- Incorrect `*_HEALTHCHECK_URL`
- GitHub environment protection waiting for manual approval

### GitLab CI

- Similar to GitHub Actions
- Built-in Docker registry
- Kubernetes deployment

### Jenkins

- Self-hosted option
- Highly customizable
- Good for complex pipelines

## Test Reporting

### Coverage Reports

- HTML report: `testing-infrastructure/coverage/lcov-report/index.html`
- Console summary
- Upload to Codecov/Coveralls

### Load Test Reports

- k6 HTML report
- Grafana dashboard integration
- Performance trends over time

### Security Reports

- OWASP ZAP report
- Vulnerability severity ratings
- Remediation recommendations

## Best Practices

1. **Test Independence** — Tests should not depend on each other
2. **Fast Feedback** — Unit tests run in <5 seconds
3. **Deterministic** — Tests should always produce the same result
4. **Descriptive Names** — Test names explain what they verify
5. **Minimal Mocking** — Use real dependencies when possible in integration tests
6. **Test Data Isolation** — Each test uses unique data
7. **Cleanup** — Always clean up resources after tests
8. **Parallel Execution** — Tests run in parallel for speed

## Common Commands

```bash
# Development
npm run test:watch           # Watch mode for TDD
npm run test:debug          # Debug tests in Node inspector
npm run test:single         # Run single test file

# CI/CD
npm run test:ci             # Run all tests with coverage
npm run test:changed        # Only test changed files
npm run test:affected       # Only test affected services

# Performance
npm run test:load:smoke     # Quick load test
npm run test:load:stress    # Stress test
npm run test:load:soak      # Long-running test

# Security
npm run test:security:scan  # Full security scan
npm run test:security:deps  # Check dependencies
```

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Docker volumes
- Verify environment variables
- Check for file path issues (Windows vs Unix)

### Flaky Tests

- Add retry logic for network requests
- Increase timeouts for slow operations
- Use proper wait conditions

### Slow Tests

- Parallelize test execution
- Use test databases instead of mocks where possible
- Profile with `--detect-leaks` flag

## Next Steps

1. Review each test type section for detailed examples
2. Set up CI/CD pipeline (GitHub Actions recommended)
3. Establish coverage thresholds
4. Integrate test reports into PRs
5. Schedule nightly load/security tests
