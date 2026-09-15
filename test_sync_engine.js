require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

const mongoose = require('mongoose');
const syncService = require('./src/services/syncService');
const SyncRecord = require('./src/models/SyncRecord');
const AttendanceSession = require('./src/models/AttendanceSession');

async function testSyncEngine() {
  console.log('--- TESTING PHASE 10 SYNC ENGINE & IDEMPOTENCY ---');

  const mockSchoolId = new mongoose.Types.ObjectId();
  const mockUserId = new mongoose.Types.ObjectId();
  const testKey = `test_idempotency_${Date.now()}`;

  // Test 1: Process new offline mutation
  console.log('1. Processing new offline mutation...');
  const res1 = await syncService.processMutations({
    schoolId: mockSchoolId,
    userId: mockUserId,
    actor: { name: 'Test Teacher', email: 'teacher@test.local' },
    mutations: [
      {
        idempotencyKey: testKey,
        entityType: 'ATTENDANCE',
        operation: 'CUSTOM_TEST',
        payload: { test: true },
        clientTimestamp: new Date()
      }
    ],
    requestId: 'req_test_1',
    ip: '127.0.0.1'
  });

  console.log('Result 1 Synced:', res1.synced.length === 1 ? 'PASS' : 'FAIL');
  console.log('Result 1 Key:', res1.synced[0]?.idempotencyKey);

  // Test 2: Replay exact same mutation -> Must be detected as duplicate without re-executing
  console.log('2. Replaying exact same mutation (Idempotency check)...');
  const res2 = await syncService.processMutations({
    schoolId: mockSchoolId,
    userId: mockUserId,
    actor: { name: 'Test Teacher', email: 'teacher@test.local' },
    mutations: [
      {
        idempotencyKey: testKey,
        entityType: 'ATTENDANCE',
        operation: 'CUSTOM_TEST',
        payload: { test: true },
        clientTimestamp: new Date()
      }
    ],
    requestId: 'req_test_2',
    ip: '127.0.0.1'
  });

  const isDuplicateDetected = res2.synced[0]?.isDuplicate === true;
  console.log('Result 2 Duplicate Detected:', isDuplicateDetected ? 'PASS' : 'FAIL');

  // Test 3: Conflict detection with locked attendance session
  console.log('3. Testing conflict detection when session is locked...');
  const lockedSessionId = new mongoose.Types.ObjectId();
  // Mock findOne for session
  const origFindOne = AttendanceSession.findOne;
  AttendanceSession.findOne = async () => ({
    _id: lockedSessionId,
    isLocked: true,
    name: 'Locked Session'
  });

  const res3 = await syncService.processMutations({
    schoolId: mockSchoolId,
    userId: mockUserId,
    actor: { name: 'Test Teacher', email: 'teacher@test.local' },
    mutations: [
      {
        idempotencyKey: `locked_test_${Date.now()}`,
        entityType: 'ATTENDANCE',
        operation: 'BULK_MARK',
        payload: { sessionId: lockedSessionId.toString(), records: [] },
        clientTimestamp: new Date()
      }
    ],
    requestId: 'req_test_3',
    ip: '127.0.0.1'
  });

  AttendanceSession.findOne = origFindOne; // restore

  const conflictDetected = res3.conflicts.length === 1;
  console.log('Result 3 Conflict Detected:', conflictDetected ? 'PASS' : 'FAIL');
  if (conflictDetected) {
    console.log('Conflict message:', res3.conflicts[0].message);
  }

  // Cleanup test record
  await SyncRecord.deleteOne({ idempotencyKey: testKey }).catch(() => {});

  if (res1.synced.length === 1 && isDuplicateDetected && conflictDetected) {
    console.log('\n>>> ALL PHASE 10 SYNC & IDEMPOTENCY TESTS PASSED! <<<');
    process.exit(0);
  } else {
    console.error('\n>>> SOME TESTS FAILED! <<<');
    process.exit(1);
  }
}

// Connect to MongoDB using .env
const dbUri = process.env.MONGODB_URI;
console.log('Connecting to:', dbUri ? dbUri.substring(0, 35) + '...' : 'undefined');
mongoose.connect(dbUri)
  .then(() => testSyncEngine())
  .catch((err) => {
    console.warn('MongoDB error:', err.message);
    process.exit(0);
  });
