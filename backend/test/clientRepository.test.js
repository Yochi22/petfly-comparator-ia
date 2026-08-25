const test = require('node:test');
const assert = require('node:assert/strict');
const { mapClient } = require('../infrastructure/clientRepository');

test('la clave de cliente incluye la fila y evita colisiones por client_id duplicado', () => {
  const values = { client_id: 'F51052192', dog_name: 'Konrad Apolo' };
  const client = mapClient({ rowNumber: 59, get: header => values[header] });
  assert.equal(client.client_key, 'F51052192::row-59');
  assert.equal(client.sheet_row, 59);
});
