const BASE_URL = String(process.env.E2E_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const ANALYTICS_HEALTH_URL = process.env.SMOKE_ANALYTICS_HEALTH_URL || 'http://localhost:3008/api/v1/health/live';
const PROMETHEUS_HEALTH_URL = process.env.SMOKE_PROMETHEUS_HEALTH_URL || 'http://localhost:9099/-/healthy';
const GRAFANA_HEALTH_URL = process.env.SMOKE_GRAFANA_HEALTH_URL || 'http://localhost:3009/api/health';
const JAEGER_URL = process.env.SMOKE_JAEGER_URL || 'http://localhost:16686/';
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 5000);

const targets = [
  { name: 'api-gateway', url: `${BASE_URL}/health/live`, expectedStatuses: [200] },
  { name: 'analytics-service', url: ANALYTICS_HEALTH_URL, expectedStatuses: [200] },
  { name: 'prometheus', url: PROMETHEUS_HEALTH_URL, expectedStatuses: [200] },
  { name: 'grafana', url: GRAFANA_HEALTH_URL, expectedStatuses: [200] },
  { name: 'jaeger', url: JAEGER_URL, expectedStatuses: [200] },
];

async function checkTarget(target) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!target.expectedStatuses.includes(response.status)) {
      throw new Error(`expected ${target.expectedStatuses.join('/')} but got ${response.status}`);
    }

    console.log(`[smoke] PASS ${target.name} -> ${response.status}`);
    return true;
  } catch (error) {
    const message = error.name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : error.message;
    console.error(`[smoke] FAIL ${target.name} -> ${message}`);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  console.log(`[smoke] Checking ${targets.length} targets`);
  const results = await Promise.all(targets.map(checkTarget));
  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;

  console.log(`[smoke] Summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[smoke] FAILED: ${error.message}`);
  process.exitCode = 1;
});
