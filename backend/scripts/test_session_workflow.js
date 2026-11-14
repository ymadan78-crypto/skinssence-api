const db = require('../db');

async function testSessionWorkflow() {
  const testDate = '2026-11-20'; // Future test date to avoid touching real days

  console.log(`--- Testing Session Lifecycle for Date ${testDate} ---`);

  // Cleanup any existing test sessions for 2026-11-20
  await db.runAsync('DELETE FROM clinic_daily_sessions WHERE session_date = ?', [testDate]);
  await db.runAsync('DELETE FROM payments WHERE payment_date LIKE ?', [`${testDate}%`]);

  // Helper from server.js logic:
  async function getActiveSession(tDate) {
    const sessions = await db.allAsync(
      'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
      [tDate]
    );
    const s1 = (sessions || []).find(s => s.session_number === 1);
    const s2 = (sessions || []).find(s => s.session_number === 2);

    if (!s1 || s1.status === 'OPEN') {
      return { session_num: 1, s1_status: s1 ? s1.status : 'OPEN', s2_status: s2 ? s2.status : 'NOT_STARTED', can_transact: true, s1, s2 };
    }
    if (!s2 || s2.status === 'OPEN') {
      return { session_num: 2, s1_status: 'CLOSED', s2_status: s2 ? s2.status : 'OPEN', can_transact: true, s1, s2 };
    }
    return { session_num: 2, s1_status: 'CLOSED', s2_status: 'CLOSED', can_transact: false, s1, s2 };
  }

  // Step 1: Initial state (Day start)
  let state = await getActiveSession(testDate);
  console.log('1. Initial State:', state.session_num, 'can_transact:', state.can_transact, 's1:', state.s1_status, 's2:', state.s2_status);
  if (state.session_num !== 1 || !state.can_transact) throw new Error('Step 1 failed');

  // Add dummy payment for Session 1
  await db.runAsync(
    'INSERT INTO payments (amount_received, mode, purpose, payment_date, session_num) VALUES (?, ?, ?, ?, ?)',
    [1500, 'UPI', 'VISIT', `${testDate}T10:30:00Z`, 1]
  );

  // Step 2: Staff Ends Session 1
  const nowIso1 = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO clinic_daily_sessions (session_date, session_number, status, opened_at, closed_at, closed_by_id, closed_by_name, procedure_collection, medicine_collection, grand_total)
     VALUES (?, 1, 'CLOSED', ?, ?, 1, 'Staff Alice', 1500, 0, 1500)`,
    [testDate, `${testDate}T09:00:00Z`, nowIso1]
  );
  await db.runAsync(
    `INSERT INTO clinic_daily_sessions (session_date, session_number, status, opened_at)
     VALUES (?, 2, 'OPEN', ?)`,
    [testDate, nowIso1]
  );

  state = await getActiveSession(testDate);
  console.log('2. After Session 1 Closed:', state.session_num, 'can_transact:', state.can_transact, 's1:', state.s1_status, 's2:', state.s2_status);
  if (state.session_num !== 2 || state.s1_status !== 'CLOSED' || state.s2_status !== 'OPEN') throw new Error('Step 2 failed');

  // Add dummy payment for Session 2
  await db.runAsync(
    'INSERT INTO payments (amount_received, mode, purpose, payment_date, session_num) VALUES (?, ?, ?, ?, ?)',
    [800, 'CASH', 'PHARMACY', `${testDate}T18:00:00Z`, 2]
  );

  // Step 3: Staff Ends Session 2
  const nowIso2 = new Date().toISOString();
  await db.runAsync(
    `UPDATE clinic_daily_sessions
     SET status = 'CLOSED', closed_at = ?, closed_by_id = 1, closed_by_name = 'Staff Alice', procedure_collection = 0, medicine_collection = 800, grand_total = 800
     WHERE session_date = ? AND session_number = 2`,
    [nowIso2, testDate]
  );

  state = await getActiveSession(testDate);
  console.log('3. After Session 2 Closed (Full Day Finalized):', state.session_num, 'can_transact:', state.can_transact, 's1:', state.s1_status, 's2:', state.s2_status);
  if (state.can_transact !== false || state.s1_status !== 'CLOSED' || state.s2_status !== 'CLOSED') throw new Error('Step 3 failed');

  // Step 4: Admin Reopens Session 2 with reason
  const reopenReason = 'Doctor performed emergency evening laser procedure';
  await db.runAsync(
    `UPDATE clinic_daily_sessions
     SET status = 'OPEN', reopened_at = ?, reopened_by_id = 99, reopened_by_name = 'Dr. Admin', reopen_reason = ?
     WHERE session_date = ? AND session_number = 2`,
    [new Date().toISOString(), reopenReason, testDate]
  );

  state = await getActiveSession(testDate);
  console.log('4. After Admin Reopen Session 2:', state.session_num, 'can_transact:', state.can_transact, 's2:', state.s2_status);
  if (state.can_transact !== true || state.s2_status !== 'OPEN') throw new Error('Step 4 failed');

  // Check audit integrity
  const s2Row = await db.getAsync('SELECT * FROM clinic_daily_sessions WHERE session_date = ? AND session_number = 2', [testDate]);
  console.log('5. Audit Check:', 'reopen_reason:', s2Row.reopen_reason, 'reopened_by:', s2Row.reopened_by_name);
  if (s2Row.reopen_reason !== reopenReason) throw new Error('Step 5 failed');

  // Cleanup test data
  await db.runAsync('DELETE FROM clinic_daily_sessions WHERE session_date = ?', [testDate]);
  await db.runAsync('DELETE FROM payments WHERE payment_date LIKE ?', [`${testDate}%`]);
  console.log('✅ ALL SESSION LIFECYCLE TESTS PASSED PERFECTLY!');
  process.exit(0);
}

testSessionWorkflow().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
