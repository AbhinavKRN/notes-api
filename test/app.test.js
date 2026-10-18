const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');

test('probes, version and metrics', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close() && server.closeAllConnections());
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.strictEqual((await fetch(`${base}/healthz`)).status, 200);
  assert.strictEqual((await fetch(`${base}/readyz`)).status, 503);

  const version = await (await fetch(`${base}/version`)).json();
  assert.ok(version.commit);

  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /http_requests_total\{method="GET",route="\/healthz",status="200"\} 1/);
});
