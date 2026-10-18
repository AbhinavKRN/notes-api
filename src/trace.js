const crypto = require('crypto');
const http = require('http');

const endpoint = process.env.OTEL_URL;

function span() {
  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  const start = BigInt(Date.now()) * 1000000n;
  return {
    traceId,
    end(name, status) {
      if (!endpoint) return;
      const body = JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'notes-api' } }] },
          scopeSpans: [{
            spans: [{
              traceId,
              spanId,
              name,
              kind: 2,
              startTimeUnixNano: start.toString(),
              endTimeUnixNano: (BigInt(Date.now()) * 1000000n).toString(),
              attributes: [{ key: 'http.response.status_code', value: { intValue: String(status) } }],
              status: { code: status >= 500 ? 2 : 1 },
            }],
          }],
        }],
      });
      const req = http.request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' } });
      req.on('error', () => {});
      req.end(body);
    },
  };
}

module.exports = { span };
