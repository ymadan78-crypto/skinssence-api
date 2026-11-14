const fs = require('fs');

function updateServer(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. In GET /api/sessions/status: add staff_submission info
  const oldSessRes = `      reports: reportData
    });`;

  const newSessRes = `      reports: reportData,
      staff_submission: {
        submitted: !!staffSummaryRow,
        report: staffSummaryRow || null,
        staff_name: staffSummaryRow ? staffSummaryRow.staff_name : null,
        submission_date: staffSummaryRow ? (staffSummaryRow.created_at || staffSummaryRow.report_date) : null
      }
    });`;

  if (!content.includes('staffSummaryRow = await db.getAsync') && content.includes(oldSessRes)) {
    const sessTarget = `const sessionInfo = await getActiveSessionForDate(targetDate);
    const reportData = await calculateSessionFinancialReports(targetDate);`;

    const sessReplacement = `const sessionInfo = await getActiveSessionForDate(targetDate);
    const reportData = await calculateSessionFinancialReports(targetDate);
    const staffSummaryRow = await db.getAsync(
      'SELECT * FROM staff_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1',
      [targetDate]
    );`;

    content = content.replace(sessTarget, sessReplacement);
    content = content.replace(oldSessRes, newSessRes);
  }

  // 2. In POST /api/sessions/end: include staff_submission in response
  const oldEndRes = `      reports: updatedReports,
      session_status: sessionStatus
    });`;

  const newEndRes = `      reports: updatedReports,
      session_status: sessionStatus,
      staff_submission: {
        submitted: !!endStaffSummaryRow,
        report: endStaffSummaryRow || null,
        staff_name: endStaffSummaryRow ? endStaffSummaryRow.staff_name : null,
        submission_date: endStaffSummaryRow ? (endStaffSummaryRow.created_at || endStaffSummaryRow.report_date) : null
      }
    });`;

  if (!content.includes('endStaffSummaryRow = await db.getAsync') && content.includes(oldEndRes)) {
    const endTarget = `const updatedReports = await calculateSessionFinancialReports(targetDate);
    const sessionStatus = await getActiveSessionForDate(targetDate);`;

    const endReplacement = `const updatedReports = await calculateSessionFinancialReports(targetDate);
    const sessionStatus = await getActiveSessionForDate(targetDate);
    const endStaffSummaryRow = await db.getAsync(
      'SELECT * FROM staff_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1',
      [targetDate]
    );`;

    content = content.replace(endTarget, endReplacement);
    content = content.replace(oldEndRes, newEndRes);
  }

  // 3. In GET /api/admin/diary: query staff_daily_reports and add staff_submission
  const oldDiaryAppt = `                // Return combined daily response with session status and financial reports
                res.json({`;

  const newDiaryAppt = `                const staffReportRow = await db.getAsync(
                  'SELECT * FROM staff_daily_reports WHERE report_date = ? ORDER BY id DESC LIMIT 1',
                  [targetDate]
                );

                // Return combined daily response with session status, financial reports and staff submission
                res.json({`;

  if (!content.includes('staffReportRow = await db.getAsync') && content.includes(oldDiaryAppt)) {
    content = content.replace(oldDiaryAppt, newDiaryAppt);

    const oldDiaryFin = `financial_reports: financialReports,`;
    const newDiaryFin = `financial_reports: financialReports,
                  staff_submission: {
                    submitted: !!staffReportRow,
                    report: staffReportRow || null,
                    staff_name: staffReportRow ? staffReportRow.staff_name : null,
                    submission_date: staffReportRow ? (staffReportRow.created_at || staffReportRow.report_date) : null
                  },`;
    content = content.replace(oldDiaryFin, newDiaryFin);
  }

  // 4. In POST /api/staff/daily-summary: prevent duplicate submissions, support update/revision
  const oldSummaryInsert = `    const result = await db.runAsync(\`
      INSERT INTO staff_daily_reports (
        report_date, staff_id, staff_name,
        followup_calls_count, followup_whatsapp_count,
        birthday_messages_count, reviews_collected_count,
        total_visiting_patients, summary_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    \`, [
      rDate,
      staff_id,
      staff_name,
      parseInt(followup_calls_count, 10) || 0,
      parseInt(followup_whatsapp_count, 10) || 0,
      parseInt(birthday_messages_count, 10) || 0,
      parseInt(reviews_collected_count, 10) || 0,
      parseInt(total_visiting_patients, 10) || 0,
      summary_notes || ''
    ]);

    res.json({
      success: true,
      id: result?.lastID || null,
      message: 'Daily summary report submitted successfully'
    });`;

  const newSummaryInsert = `    // Check for existing submission for this date and staff to prevent duplicates
    const existing = await db.getAsync(
      'SELECT id FROM staff_daily_reports WHERE report_date = ? AND (staff_id = ? OR staff_name = ?) ORDER BY id DESC LIMIT 1',
      [rDate, staff_id, staff_name]
    );

    let reportId;
    if (existing) {
      await db.runAsync(\`
        UPDATE staff_daily_reports
        SET followup_calls_count = ?, followup_whatsapp_count = ?,
            birthday_messages_count = ?, reviews_collected_count = ?,
            total_visiting_patients = ?, summary_notes = ?, staff_name = ?, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      \`, [
        parseInt(followup_calls_count, 10) || 0,
        parseInt(followup_whatsapp_count, 10) || 0,
        parseInt(birthday_messages_count, 10) || 0,
        parseInt(reviews_collected_count, 10) || 0,
        parseInt(total_visiting_patients, 10) || 0,
        summary_notes || '',
        staff_name,
        existing.id
      ]);
      reportId = existing.id;
    } else {
      const result = await db.runAsync(\`
        INSERT INTO staff_daily_reports (
          report_date, staff_id, staff_name,
          followup_calls_count, followup_whatsapp_count,
          birthday_messages_count, reviews_collected_count,
          total_visiting_patients, summary_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      \`, [
        rDate,
        staff_id,
        staff_name,
        parseInt(followup_calls_count, 10) || 0,
        parseInt(followup_whatsapp_count, 10) || 0,
        parseInt(birthday_messages_count, 10) || 0,
        parseInt(reviews_collected_count, 10) || 0,
        parseInt(total_visiting_patients, 10) || 0,
        summary_notes || ''
      ]);
      reportId = result?.lastID;
    }

    const savedSummary = await db.getAsync('SELECT * FROM staff_daily_reports WHERE id = ?', [reportId]);

    res.json({
      success: true,
      id: reportId,
      summary: savedSummary,
      message: existing ? 'Daily summary report updated successfully' : 'Daily summary report submitted successfully'
    });`;

  if (content.includes(oldSummaryInsert)) {
    content = content.replace(oldSummaryInsert, newSummaryInsert);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath} with staff submission integration!`);
}

updateServer('server.js');
updateServer('backend/server.js');
