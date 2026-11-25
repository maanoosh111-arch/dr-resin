// Verification specification for the Dirty Dozen security rule assertions.
export const dirtyDozenCases = [
  { id: 1, target: '/storeSettings/public', op: 'create', auth: null, expected: 'PERMISSION_DENIED' },
  { id: 2, target: '/storeSettings/public', op: 'update', auth: { uid: 'u1', email: 'guest@example.com', email_verified: true }, expected: 'PERMISSION_DENIED' },
  { id: 3, target: '/orders/ORD-1001', op: 'create', auth: { uid: 'u2', email: 'mahmoudmohamedhh999@gmail.com', email_verified: false }, expected: 'PERMISSION_DENIED' },
  { id: 4, target: '/orders', op: 'list', auth: null, expected: 'PERMISSION_DENIED' },
  { id: 5, target: '/orders/ORD-1001', op: 'get', auth: { uid: 'u1', email: 'guest@example.com', email_verified: true }, expected: 'PERMISSION_DENIED' },
  { id: 6, target: '/admins/u1', op: 'create', auth: { uid: 'u1', email: 'guest@example.com', email_verified: true }, expected: 'PERMISSION_DENIED' },
  { id: 7, target: '/storeSettings/public', op: 'update', payload: { isVerified: true }, expected: 'PERMISSION_DENIED' },
  { id: 8, target: '/storeSettings/public', op: 'update', payload: { customNoteLength: 501 }, expected: 'PERMISSION_DENIED' },
  { id: 9, target: '/orders/invalid$id', op: 'create', expected: 'PERMISSION_DENIED' },
  { id: 10, target: '/orders/ORD-1001', op: 'update', payload: { status: 'Hacked' }, expected: 'PERMISSION_DENIED' },
  { id: 11, target: '/orders/ORD-1001', op: 'update', payload: { orderCode: 'ORD-9999' }, expected: 'PERMISSION_DENIED' },
  { id: 12, target: '/test/connection', op: 'create', expected: 'PERMISSION_DENIED' },
];
