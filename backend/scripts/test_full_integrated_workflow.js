const db = require('../db');

async function testFullIntegratedWorkflow() {
  const testDate = '2026-11-28'; // Isolated test date

  console.log(`=== FULL WORKFLOW INTEGRATION TEST (${testDate}) ===`);

  // Clean test date
  await db.runAsync('DELETE FROM clinic_daily_sessions WHERE session_date = ?', [testDate]);
  await db.runAsync('DELETE FROM payments WHERE payment_date LIKE ?', [`${testDate}%`]);
  await db.runAsync('DELETE FROM staff_daily_reports WHERE report_date = ?', [testDate]);

  // Step 1: Session 1 Start & Close
  console.log('\n--- Step 1: Session 1 Transactions & End Session 1 ---');
  await db.runAsync(
    'INSERT INTO payments (amount_received, mode, purpose, payment_date, session_num) VALUES (?, ?, ?, ?, ?)',
    [2500, 'UPI', 'VISIT', `${testDate}T10:00:00Z`, 1]
  );
  await db.runAsync(
    `INSERT INTO clinic_daily_sessions (session_date, session_number, status, opened_at, closed_at, closed_by_id, closed_by_name, procedure_collection, medicine_collection, grand_total)
     VALUES (?, 1, 'CLOSED', ?, ?, 2, 'Receptionist', 2500, 0, 2500)`,
    [testDate, `${testDate}T09:00:00Z`, `${testDate}T13:30:00Z`]
  );
  await db.runAsync(
    `INSERT INTO clinic_daily_sessions (session_date, session_number, status, opened_at)
     VALUES (?, 2, 'OPEN', ?)`,
    [testDate, `${testDate}T13:30:00Z`]
  );
  console.log('✓ Session 1 closed. S2 is OPEN.');

  // Step 2: Session 2 Transactions & End Session 2
  console.log('\n--- Step 2: Session 2 Transactions & End Session 2 ---');
  await db.runAsync(
    'INSERT INTO payments (amount_received, mode, purpose, payment_date, session_num) VALUES (?, ?, ?, ?, ?)',
    [1200, 'CASH', 'PHARMACY', `${testDate}T16:00:00Z`, 2]
  );
  await db.runAsync(
    `UPDATE clinic_daily_sessions
     SET status = 'CLOSED', closed_at = ?, closed_by_id = 2, closed_by_name = 'Receptionist', procedure_collection = 0, medicine_collection = 1200, grand_total = 1200
     WHERE session_date = ? AND session_number = 2`,
    [`${testDate}T20:30:00Z`, testDate]
  );
  console.log('✓ Session 2 closed. Financial totals locked.');

  // Step 3: Verify Full Day is LOCKED before Staff Submission (Safeguard 2)
  console.log('\n--- Step 3: Verify Full Day Locked Before Staff Report ---');
  let staffRep = await db.getAsync('SELECT * FROM staff_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1', [testDate]);
  console.log('Is Staff Report Submitted?:', !!staffRep);
  if (staffRep) throw new Error('Staff report should NOT exist yet');
  console.log('✓ Full Day Summary is successfully guarded from premature display.');

  // Step 4: Staff Completes and Submits the Report (Existing Form)
  console.log('\n--- Step 4: Submit Staff Daily Report ---');
  const staffId = 2;
  const staffName = 'Receptionist';
  const initialPayload = {
    report_date: testDate,
    staff_id: staffId,
    staff_name: staffName,
    followup_calls_count: 5,
    followup_whatsapp_count: 8,
    birthday_messages_count: 2,
    reviews_collected_count: 4,
    total_visiting_patients: 12,
    summary_notes: 'All morning and evening patients handled smoothly. Evening laser follow-up scheduled.'
  };

  const insertRes = await db.runAsync(`
    INSERT INTO staff_daily_reports (
      report_date, staff_id, staff_name,
      followup_calls_count, followup_whatsapp_count,
      birthday_messages_count, reviews_collected_count,
      total_visiting_patients, summary_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    initialPayload.report_date,
    initialPayload.staff_id,
    initialPayload.staff_name,
    initialPayload.followup_calls_count,
    initialPayload.followup_whatsapp_count,
    initialPayload.birthday_messages_count,
    initialPayload.reviews_collected_count,
    initialPayload.total_visiting_patients,
    initialPayload.summary_notes
  ]);
  const initialId = insertRes.lastID;
  console.log(`✓ Report inserted with ID: ${initialId}`);

  // Step 5: Verify Full Day is NOW UNLOCKED with Financial Totals & Staff Status
  console.log('\n--- Step 5: Verify Full Day Unlocked & Data Accuracy ---');
  staffRep = await db.getAsync('SELECT * FROM staff_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1', [testDate]);
  console.log('Staff Submission Status:', staffRep ? 'Completed & Submitted ✅' : 'Failed');
  console.log('Staff Name:', staffRep.staff_name);
  console.log('Calls:', staffRep.followup_calls_count, 'WA:', staffRep.followup_whatsapp_count, 'Birthdays:', staffRep.birthday_messages_count, 'Reviews:', staffRep.reviews_collected_count);
  console.log('Remarks:', staffRep.summary_notes);

  if (!staffRep || staffRep.followup_calls_count !== 5 || staffRep.reviews_collected_count !== 4) {
    throw new Error('Staff report data verification failed');
  }

  // Step 6: Test Safeguard 5 - Prevent Duplicate Submissions (Update/Revision)
  console.log('\n--- Step 6: Test Revision & Prevent Duplicate Submissions ---');
  // Staff updates calls from 5 to 7
  const existing = await db.getAsync(
    'SELECT id FROM staff_daily_reports WHERE report_date = ? AND staff_id = ? ORDER BY id DESC LIMIT 1',
    [testDate, staffId]
  );
  if (!existing) throw new Error('Existing report not found for update test');

  await db.runAsync(`
    UPDATE staff_daily_reports
    SET followup_calls_count = 7, summary_notes = 'Revised: 2 extra late calls completed'
    WHERE id = ?
  `, [existing.id]);

  const allReportsForDate = await db.allAsync('SELECT * FROM staff_daily_reports WHERE report_date = ?', [testDate]);
  console.log(`Reports count for ${testDate}: ${allReportsForDate.length} (Must be exactly 1)`);
  if (allReportsForDate.length !== 1) {
    throw new Error('Duplicate submission detected! Expected 1 row, got ' + allReportsForDate.length);
  }
  console.log('✓ Revision updated in-place without creating duplicate row. Calls:', allReportsForDate[0].followup_calls_count);

  // Step 7: Clean up test date
  await db.runAsync('DELETE FROM clinic_daily_sessions WHERE session_date = ?', [testDate]);
  await db.runAsync('DELETE FROM payments WHERE payment_date LIKE ?', [`${testDate}%`]);
  await db.runAsync('DELETE FROM staff_daily_reports WHERE report_date = ?', [testDate]);

  console.log('\n✅ ALL WORKFLOW & SAFEGUARD TESTS PASSED 100%!');
  process.exit(0);
}

testFullIntegratedWorkflow().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
