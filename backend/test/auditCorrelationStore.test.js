const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditCorrelationStore } = require('../infrastructure/auditCorrelationStore');

test('correlaciona cargas separadas únicamente dentro de la misma auditoría y cliente', () => {
  const store = new AuditCorrelationStore();
  const auditId = store.createId();
  store.put(auditId, 'cliente::row-59', 'CERTIFICACION_ADI', { certificateNumber: 'AST-2026-8812' });
  store.put(auditId, 'cliente::row-59', 'ADI', { certificateNumber: 'AST-2026-8812' });
  assert.equal(store.get(auditId, 'cliente::row-59').documents.ADI.certificateNumber, 'AST-2026-8812');
  assert.equal(store.get(auditId, 'otro-cliente'), null);
});

test('rechaza reutilizar un auditId con otro cliente', () => {
  const store = new AuditCorrelationStore();
  const auditId = store.createId();
  store.put(auditId, 'cliente-a', 'ADI', {});
  assert.throws(() => store.put(auditId, 'cliente-b', 'CERTIFICACION_ADI', {}), /otro cliente/i);
});
