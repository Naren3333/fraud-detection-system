# Demo Bank UI

This folder contains a simple frontend used to demonstrate the live fraud detection platform through the API Gateway.

## Features

- User register, login, refresh, logout, and profile update
- Transaction submission with different amount, currency, and location inputs
- Transaction status refresh for `PENDING`, `APPROVED`, `REJECTED`, and `FLAGGED`
- Appeal submission and appeal resolution flow
- Decision explainability view for each transaction
- Rendered email inbox preview for flagged and declined outcomes

## Prerequisites

- The main stack is running with `docker compose up --build -d`
- API Gateway is reachable at `http://localhost:3000`

## Run

From the `demo` folder:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Runtime Configuration

Runtime settings are stored in `demo/config.js`:

- `apiBase`
- `apiPort`
- `azureHost`
- `apiTimeoutMs`
- `pollIntervalMs`

If `apiBase` is empty, the demo builds a default API URL from the current host and port `3000`. You can also change the API base URL directly in the UI.

## Suggested Demo Flow

1. Register and log in as a user.
2. Submit a normal transaction and show it reaches `APPROVED`.
3. Submit a risky transaction and show it becomes `FLAGGED` or `REJECTED`.
4. Open the transaction row to show decision explainability.
5. If needed, submit an appeal and resolve it from the appeals panel.
6. Open the email inbox preview and the analytics dashboard to show the downstream results.

## Note

The current decision-engine settings in `docker-compose.yml` automatically flag transactions at or above `10000`, so high-value transfers are useful for manual review demos.
