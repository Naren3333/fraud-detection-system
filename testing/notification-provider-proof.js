const NOTIFICATION_HEALTH_URL = process.env.NOTIFICATION_PROOF_URL || 'http://localhost:3006/api/v1/health';
const REQUEST_TIMEOUT_MS = Number(process.env.NOTIFICATION_PROOF_TIMEOUT_MS || 5000);
const REQUIRE_REAL_NOTIFICATION_PROVIDER = process.env.REQUIRE_REAL_NOTIFICATION_PROVIDER === 'true';

async function main() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(NOTIFICATION_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new Error(`Notification health returned ${response.status}`);
    }

    const body = await response.json();
    const email = body.dependencies?.email || {};
    const sms = body.dependencies?.sms || {};
    const providers = body.notificationProviders || {};

    console.log('[notification-proof] Notification provider summary');
    console.log(`[notification-proof] email -> enabled=${Boolean(email.enabled)} provider=${email.provider || 'n/a'} mode=${email.mode || 'n/a'} status=${email.status || 'n/a'}`);
    console.log(`[notification-proof] sms   -> enabled=${Boolean(sms.enabled)} provider=${sms.provider || 'n/a'} mode=${sms.mode || 'n/a'} status=${sms.status || 'n/a'}`);
    console.log(`[notification-proof] real-provider-enabled=${Boolean(providers.realProviderEnabled)}`);

    if (!REQUIRE_REAL_NOTIFICATION_PROVIDER) {
      console.log('[notification-proof] PASS (mock or real providers accepted)');
      return;
    }

    const realChannels = [email, sms].filter((channel) => channel.enabled && channel.mode === 'external');
    if (realChannels.length === 0) {
      throw new Error('REQUIRE_REAL_NOTIFICATION_PROVIDER=true but no real SMTP/Twilio provider is enabled');
    }

    const unhealthyRealChannel = realChannels.find((channel) => channel.status !== 'healthy');
    if (unhealthyRealChannel) {
      throw new Error(`Real notification provider is enabled but unhealthy (${unhealthyRealChannel.provider})`);
    }

    console.log('[notification-proof] PASS (real external notification provider enabled and healthy)');
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[notification-proof] FAILED: timed out after ${REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.error(`[notification-proof] FAILED: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
