# Notification Service

This service consumes fraud decision events and sends notifications through:

- `mock` providers for local/demo-safe runs
- `smtp` for real email delivery
- `twilio` for real SMS delivery

You can enable either external channel by updating the project root `.env`.

## Supported Modes

- Email:
  - `mock`
  - `smtp`
- SMS:
  - `mock`
  - `twilio`

You can run:

- email external + sms mock
- sms external + email mock
- both external
- both mock

## Required `.env` Settings

These variables live in the project root `.env`, not inside `notification-service/.env`.

### SMTP Email

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-account@example.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=your-account@example.com
EMAIL_FROM_NAME=Fraud Detection System
```

### Twilio SMS

```env
SMS_ENABLED=true
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

### Real Recipients For Demo

If an event does not contain contact details, the service falls back to these:

```env
NOTIFICATION_CUSTOMER_FALLBACK_EMAIL=real-customer@example.com
NOTIFICATION_CUSTOMER_FALLBACK_PHONE=+1xxxxxxxxxx
NOTIFICATION_FRAUD_TEAM_EMAIL=fraud-team@example.com
NOTIFICATION_FRAUD_TEAM_PHONE=+1xxxxxxxxxx
```

## Start With External Providers

If the full stack is not running yet:

```powershell
docker compose up --build -d
```

If the stack is already running and you only changed notification credentials:

```powershell
docker compose up --build -d notification-service
```

## Verify The Provider Mode

### Health Endpoint

```powershell
Invoke-RestMethod http://localhost:3006/api/v1/health | ConvertTo-Json -Depth 6
```

What to look for:

- `dependencies.email.mode` should be `external` when SMTP is active
- `dependencies.sms.mode` should be `external` when Twilio is active
- `notificationProviders.realProviderEnabled` should be `true`

### Proof Script

From the project root:

```powershell
cd testing
node .\notification-provider-proof.js
```

To fail unless a real provider is active and healthy:

```powershell
cd testing
$env:REQUIRE_REAL_NOTIFICATION_PROVIDER='true'
node .\notification-provider-proof.js
```

You can also use:

```powershell
cd testing
npm.cmd run proof:notification
```

## How Delivery Targets Are Chosen

The service uses contacts in this order:

1. Contact details carried in the event payload
2. Contact details from transaction metadata
3. Fallback values from `.env`

For a reliable demo, set the fallback values to real addresses and numbers.

## Common Issues

### SMTP

- Gmail usually needs an app password, not your normal password.
- Some providers require the `from` address to match the authenticated account.
- If port `587` fails, check whether your provider expects TLS/SSL settings different from `EMAIL_SMTP_SECURE=false`.

### Twilio

- Trial accounts can only send to verified numbers.
- The `TWILIO_PHONE_NUMBER` must be a number owned by your Twilio account.
- Invalid region formatting usually means the destination number is not in E.164 format.

## Quick Example

Email only:

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-account@example.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=your-account@example.com
EMAIL_FROM_NAME=Fraud Detection System

SMS_ENABLED=true
SMS_PROVIDER=mock

NOTIFICATION_CUSTOMER_FALLBACK_EMAIL=your-own-email@example.com
NOTIFICATION_FRAUD_TEAM_EMAIL=your-own-email@example.com
```

Twilio only:

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=mock

SMS_ENABLED=true
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

NOTIFICATION_CUSTOMER_FALLBACK_PHONE=+1xxxxxxxxxx
NOTIFICATION_FRAUD_TEAM_PHONE=+1xxxxxxxxxx
```
