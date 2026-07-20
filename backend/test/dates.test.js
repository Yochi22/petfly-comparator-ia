const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExpedition, parseValidity, addValidity, fmtSlash } = require('../domain/dates');

test('interpreta fechas DD/MM/YYYY e ISO sin normalizar fechas imposibles', () => {
  assert.equal(fmtSlash(parseExpedition('14/04/2026')), '14/04/2026');
  assert.equal(fmtSlash(parseExpedition('2026-04-14')), '14/04/2026');
  assert.equal(parseExpedition('31/02/2026'), null);
});

test('calcula vigencia expresada en años', () => {
  const expiry = addValidity(parseExpedition('14/04/2026'), parseValidity('3 años'));
  assert.equal(fmtSlash(expiry), '14/04/2029');
});

test('calcula vigencia expresada en meses sin convertirla en años', () => {
  const expiry = addValidity(parseExpedition('14/04/2026'), parseValidity('6 meses'));
  assert.equal(fmtSlash(expiry), '14/10/2026');
});
