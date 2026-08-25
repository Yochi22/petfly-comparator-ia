const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateAddress } = require('../infrastructure/qrPageVerifier');

test('bloquea direcciones privadas y loopback usadas para SSRF', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.2', '::1', 'fd00::1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});
