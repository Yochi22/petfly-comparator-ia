const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditCorrelationStore } = require('../infrastructure/auditCorrelationStore');

test('correlaciona ADI, Certificación ADI y REVISION dentro de la misma auditoría y cliente', () => {
  const store = new AuditCorrelationStore();
  const auditId = store.createId();
  const reference = { certificateOccurrences: [{ value: 'AST-2026-8812', location: 'encabezado' }] };
  store.put(auditId, 'cliente::row-59', 'CERTIFICACION_ADI', reference);
  store.put(auditId, 'cliente::row-59', 'ADI', reference);
  store.put(auditId, 'cliente::row-59', 'REVISION', reference);
  const documents = store.get(auditId, 'cliente::row-59').documents;
  assert.ok(documents.ADI);
  assert.ok(documents.CERTIFICACION_ADI);
  assert.ok(documents.REVISION);
  assert.equal(store.get(auditId, 'otro-cliente'), null);
});

test('rechaza reutilizar un auditId con otro cliente', () => {
  const store = new AuditCorrelationStore();
  const auditId = store.createId();
  store.put(auditId, 'cliente-a', 'ADI', {});
  assert.throws(() => store.put(auditId, 'cliente-b', 'REVISION', {}), /otro cliente/i);
});
