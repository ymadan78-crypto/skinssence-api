const fs = require('fs');
const path = require('path');

function updateServerCode(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add table creation and column addition if not present
  const tableCheck = "CREATE TABLE IF NOT EXISTS clinic_daily_sessions";
  if (!content.includes(tableCheck)) {
    const tableInitMarker = "// Append-only audit log";
    const tableCode = `// Clinic Daily Sessions (Morning Session 1 & Evening Session 2)
db.run(\`CREATE TABLE IF NOT EXISTS clinic_daily_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL,
    session_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    closed_by_id INTEGER,
    closed_by_name TEXT,
    procedure_collection REAL DEFAULT 0,
    medicine_collection REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    reopened_at DATETIME,
    reopened_by_id INTEGER,
    reopened_by_name TEXT,
    reopen_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_date, session_number)
)\`, () => {});

db.run("ALTER TABLE payments ADD COLUMN session_num INTEGER DEFAULT 1", () => {});

`;
    content = content.replace(tableInitMarker, tableCode + tableInitMarker);
  }

  // 2. Add helper functions getActiveSessionForDate and calculateSessionFinancialReports
  const helperCheck = "async function getActiveSessionForDate";
  if (!content.includes(helperCheck)) {
    const helperMarker = "function isTodayIST(dateInput)";
    const helperCode = `// --- CLINIC SESSIONS (STAFF-CONTROLLED SESSION 1 & 2) ---
async function getActiveSessionForDate(targetDate) {
  const tDate = (targetDate || getISTDate()).slice(0, 10);
  const sessions = await db.allAsync(
    'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
    [tDate]
  );

  const s1 = (sessions || []).find(s => s.session_number === 1);
  const s2 = (sessions || []).find(s => s.session_number === 2);

  // If no session 1 or session 1 is open
  if (!s1 || s1.status === 'OPEN') {
    return {
      session_num: 1,
      s1_status: s1 ? s1.status : 'OPEN',
      s2_status: s2 ? s2.status : 'NOT_STARTED',
      s1: s1 || null,
      s2: s2 || null,
      can_transact: true,
      active_session_name: 'Session 1 (Morning)'
    };
  }

  // Session 1 is CLOSED. Check Session 2
  if (!s2 || s2.status === 'OPEN') {
    return {
      session_num: 2,
      s1_status: 'CLOSED',
      s2_status: s2 ? s2.status : 'OPEN',
      s1,
      s2: s2 || null,
      can_transact: true,
      active_session_name: 'Session 2 (Evening)'
    };
  }

  // Both are CLOSED
  return {
    session_num: 2,
    s1_status: 'CLOSED',
    s2_status: 'CLOSED',
    s1,
    s2,
    can_transact: false,
    active_session_name: 'Both Sessions Closed (Full Day Finalized)'
  };
}

async function calculateSessionFinancialReports(targetDate) {
  const tDate = (targetDate || getISTDate()).slice(0, 10);
  const sessions = await db.allAsync(
    'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
    [tDate]
  );
  const s1 = (sessions || []).find(s => s.session_number === 1);
  const s1ClosedAt = s1 && s1.closed_at ? s1.closed_at : null;

  const payments = await db.allAsync(\`
    SELECT * FROM payments 
    WHERE date(payment_date) = date(?) OR payment_date LIKE ?
    ORDER BY id ASC
  \`, [tDate, \`\${tDate}%\`]);

  const vIds = Array.from(new Set(payments.map(p => p.visit_id).filter(Boolean)));
  let visits = [];
  let procs = [];
  let meds = [];

  if (vIds.length > 0) {
    const placeholders = vIds.map(() => '?').join(',');
    visits = await db.allAsync(\`SELECT * FROM visits WHERE id IN (\${placeholders})\`, vIds);
    procs = await db.allAsync(\`SELECT * FROM procedures WHERE visit_id IN (\${placeholders})\`, vIds);
    meds = await db.allAsync(\`SELECT * FROM medicines WHERE visit_id IN (\${placeholders})\`, vIds);
  }

  const reports = {
    session_1: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    session_2: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    full_day: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 }
  };

  payments.forEach(pay => {
    const amt = parseFloat(pay.amount_received) || 0;
    if (amt <= 0) return;

    let sNum = pay.session_num;
    if (sNum !== 1 && sNum !== 2) {
      if (s1ClosedAt) {
        sNum = (pay.payment_date <= s1ClosedAt) ? 1 : 2;
      } else {
        const timePart = (pay.payment_date || '').includes('T') ? pay.payment_date.split('T')[1] : '';
        const hour = parseInt(timePart.slice(0, 2), 10) || 12;
        sNum = hour < 10 ? 1 : 2;
      }
    }

    const v = visits.find(v => v.id === pay.visit_id);
    let procPart = 0;
    let medPart = 0;

    if (!v) {
      if (pay.purpose === 'PHARMACY') medPart = amt;
      else procPart = amt;
    } else {
      const cFee = parseFloat(v.consultation_fee) || 0;
      const vProcs = procs.filter(p => p.visit_id === v.id);
      const vMeds = meds.filter(m => m.visit_id === v.id);
      const procSum = vProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) + cFee;
      const medSum = vMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
      const totalBilled = procSum + medSum;

      if (pay.purpose === 'PHARMACY' || (totalBilled > 0 && procSum === 0)) {
        medPart = amt;
      } else if (medSum === 0) {
        procPart = amt;
      } else if (totalBilled > 0) {
        const ratio = procSum / totalBilled;
        procPart = Math.round(amt * ratio * 100) / 100;
        medPart = Math.round((amt - procPart) * 100) / 100;
      } else {
        procPart = amt;
      }
    }

    const targetKey = sNum === 1 ? 'session_1' : 'session_2';
    reports[targetKey].procedure_collection += procPart;
    reports[targetKey].medicine_collection += medPart;
    reports[targetKey].grand_total += amt;
    reports[targetKey].count += 1;

    reports.full_day.procedure_collection += procPart;
    reports.full_day.medicine_collection += medPart;
    reports.full_day.grand_total += amt;
    reports.full_day.count += 1;
  });

  ['session_1', 'session_2', 'full_day'].forEach(k => {
    reports[k].procedure_collection = Math.round(reports[k].procedure_collection * 100) / 100;
    reports[k].medicine_collection = Math.round(reports[k].medicine_collection * 100) / 100;
    reports[k].grand_total = Math.round(reports[k].grand_total * 100) / 100;
  });

  return reports;
}

`;
    content = content.replace(helperMarker, helperCode + helperMarker);
  }

  // 3. Add Endpoints: /api/sessions/status, /api/sessions/end, /api/sessions/reopen
  const endpointCheck = "app.get('/api/sessions/status'";
  if (!content.includes(endpointCheck)) {
    const endpointMarker = "app.get('/api/admin/diary'";
    const sessionEndpoints = `// --- SESSION MANAGEMENT APIS ---
// 1. Get current session status & 2-category financial reports (Session 1, Session 2, Full Day)
app.get('/api/sessions/status', authenticateToken, async (req, res) => {
  try {
    const targetDate = (req.query.date || getISTDate()).slice(0, 10);
    const sessionInfo = await getActiveSessionForDate(targetDate);
    const reportData = await calculateSessionFinancialReports(targetDate);

    res.json({
      date: targetDate,
      active_session_num: sessionInfo.session_num,
      can_transact: sessionInfo.can_transact,
      active_session_name: sessionInfo.active_session_name,
      session_1: sessionInfo.s1 || {
        session_date: targetDate,
        session_number: 1,
        status: 'OPEN',
        opened_at: null,
        closed_at: null
      },
      session_2: sessionInfo.s2 || {
        session_date: targetDate,
        session_number: 2,
        status: sessionInfo.s1 && sessionInfo.s1.status === 'CLOSED' ? 'OPEN' : 'NOT_STARTED',
        opened_at: sessionInfo.s1 ? sessionInfo.s1.closed_at : null,
        closed_at: null
      },
      reports: reportData
    });
  } catch (err) {
    console.error('Error in /api/sessions/status:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. End session (Staff or Admin closes Session 1 or Session 2)
app.post('/api/sessions/end', authenticateToken, async (req, res) => {
  try {
    const targetDate = (req.body.date || getISTDate()).slice(0, 10);
    const sessionNum = parseInt(req.body.session_number, 10);

    if (sessionNum !== 1 && sessionNum !== 2) {
      return res.status(400).json({ error: 'Invalid session number. Must be 1 or 2.' });
    }

    const userId = req.user.id;
    const userName = req.user.name || req.user.username || 'Staff';
    const nowIso = new Date().toISOString();

    const existingSessions = await db.allAsync(
      'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
      [targetDate]
    );

    const s1 = (existingSessions || []).find(s => s.session_number === 1);
    const s2 = (existingSessions || []).find(s => s.session_number === 2);

    if (sessionNum === 1) {
      if (s1 && s1.status === 'CLOSED') {
        return res.status(400).json({ error: 'Session 1 (Morning) is already closed for this date.' });
      }

      const rep = await calculateSessionFinancialReports(targetDate);
      const s1Rep = rep.session_1;

      if (s1) {
        await db.runAsync(\`
          UPDATE clinic_daily_sessions 
          SET status = 'CLOSED', closed_at = ?, closed_by_id = ?, closed_by_name = ?,
              procedure_collection = ?, medicine_collection = ?, grand_total = ?, updated_at = ?
          WHERE id = ?
        \`, [nowIso, userId, userName, s1Rep.procedure_collection, s1Rep.medicine_collection, s1Rep.grand_total, nowIso, s1.id]);
      } else {
        await db.runAsync(\`
          INSERT INTO clinic_daily_sessions (
            session_date, session_number, status, opened_at, closed_at, closed_by_id, closed_by_name,
            procedure_collection, medicine_collection, grand_total, created_at, updated_at
          ) VALUES (?, 1, 'CLOSED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`, [targetDate, nowIso, nowIso, userId, userName, s1Rep.procedure_collection, s1Rep.medicine_collection, s1Rep.grand_total, nowIso, nowIso]);
      }

      // Automatically open Session 2
      if (!s2) {
        await db.runAsync(\`
          INSERT INTO clinic_daily_sessions (
            session_date, session_number, status, opened_at, created_at, updated_at
          ) VALUES (?, 2, 'OPEN', ?, ?, ?)
        \`, [targetDate, nowIso, nowIso, nowIso]);
      } else if (s2.status === 'CLOSED') {
        // preserve
      } else {
        await db.runAsync('UPDATE clinic_daily_sessions SET status = \\'OPEN\\' WHERE id = ?', [s2.id]);
      }

      writeAudit(req.user, 'END_SESSION_1', 'SESSIONS', null, null, s1Rep, \`Session 1 ended by \${userName}\`);
    } else if (sessionNum === 2) {
      if (!s1 || s1.status !== 'CLOSED') {
        return res.status(400).json({ error: 'Session 1 must be closed before Session 2 can be closed.' });
      }
      if (s2 && s2.status === 'CLOSED') {
        return res.status(400).json({ error: 'Session 2 (Evening) is already closed for this date.' });
      }

      const rep = await calculateSessionFinancialReports(targetDate);
      const s2Rep = rep.session_2;

      if (s2) {
        await db.runAsync(\`
          UPDATE clinic_daily_sessions 
          SET status = 'CLOSED', closed_at = ?, closed_by_id = ?, closed_by_name = ?,
              procedure_collection = ?, medicine_collection = ?, grand_total = ?, updated_at = ?
          WHERE id = ?
        \`, [nowIso, userId, userName, s2Rep.procedure_collection, s2Rep.medicine_collection, s2Rep.grand_total, nowIso, s2.id]);
      } else {
        await db.runAsync(\`
          INSERT INTO clinic_daily_sessions (
            session_date, session_number, status, opened_at, closed_at, closed_by_id, closed_by_name,
            procedure_collection, medicine_collection, grand_total, created_at, updated_at
          ) VALUES (?, 2, 'CLOSED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`, [targetDate, nowIso, nowIso, userId, userName, s2Rep.procedure_collection, s2Rep.medicine_collection, s2Rep.grand_total, nowIso, nowIso]);
      }

      writeAudit(req.user, 'END_SESSION_2', 'SESSIONS', null, null, s2Rep, \`Session 2 ended by \${userName}\`);
    }

    const updatedReports = await calculateSessionFinancialReports(targetDate);
    const sessionStatus = await getActiveSessionForDate(targetDate);

    res.json({
      message: \`Session \${sessionNum} closed successfully!\`,
      session_number: sessionNum,
      reports: updatedReports,
      session_status: sessionStatus
    });
  } catch (err) {
    console.error('Error in /api/sessions/end:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Reopen session (ADMIN ONLY - with mandatory audit log & reason)
app.post('/api/sessions/reopen', authenticateToken, async (req, res) => {
  try {
    const role = (req.user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'DOCTOR') {
      return res.status(403).json({ error: 'Access denied: Only an Administrator can reopen a closed session.' });
    }

    const targetDate = (req.body.date || getISTDate()).slice(0, 10);
    const sessionNum = parseInt(req.body.session_number, 10);
    const reason = (req.body.reason || '').trim();

    if (sessionNum !== 1 && sessionNum !== 2) {
      return res.status(400).json({ error: 'Invalid session number. Must be 1 or 2.' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'A mandatory reason is required to reopen a closed session.' });
    }

    const userId = req.user.id;
    const userName = req.user.name || req.user.username || 'Admin';
    const nowIso = new Date().toISOString();

    const existingSessions = await db.allAsync(
      'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
      [targetDate]
    );

    const targetSession = (existingSessions || []).find(s => s.session_number === sessionNum);
    if (!targetSession || targetSession.status !== 'CLOSED') {
      return res.status(400).json({ error: \`Session \${sessionNum} is not currently closed.\` });
    }

    await db.runAsync(\`
      UPDATE clinic_daily_sessions
      SET status = 'OPEN', reopened_at = ?, reopened_by_id = ?, reopened_by_name = ?, reopen_reason = ?, updated_at = ?
      WHERE id = ?
    \`, [nowIso, userId, userName, reason, nowIso, targetSession.id]);

    writeAudit(req.user, 'REOPEN_SESSION', 'SESSIONS', targetSession.id, { status: 'CLOSED' }, { status: 'OPEN', reason }, reason);

    const updatedReports = await calculateSessionFinancialReports(targetDate);
    const sessionStatus = await getActiveSessionForDate(targetDate);

    res.json({
      message: \`Session \${sessionNum} reopened successfully by Admin.\`,
      session_number: sessionNum,
      reports: updatedReports,
      session_status: sessionStatus
    });
  } catch (err) {
    console.error('Error in /api/sessions/reopen:', err);
    res.status(500).json({ error: err.message });
  }
});

`;
    content = content.replace(endpointMarker, sessionEndpoints + endpointMarker);
  }

  // 4. Update /api/admin/diary to:
  // a) Consolidate medicines per visit (no individual duplication)
  // b) Tag items with session_num and return financial_reports and session_status
  // Let's find the medicines loop in /api/admin/diary:
  const oldMedsLoop = `// 3. Medicines
                meds.forEach(m => {
                  const v = visits.find(v => v.visit_id === m.visit_id);
                  const pName = v ? \`\${v.first_name || ''} \${v.last_name || ''}\`.trim() : 'Patient';
                  const pId = v ? (v.skinssence_id || \`S-\${v.patient_id}\`) : '';
                  const time = v ? formatISTTime(v.visit_date) : '';
                  const amt = parseFloat(m.amount) || 0;

                  timeline.push({
                    id: \`med-\${m.id}\`,
                    category: 'MEDICINES',
                    category_label: 'Pharmacy Sale',
                    title: \`\${pName} (\${pId}) — \${m.details}\`,
                    subtitle: \`Medicine Dispensed • ₹\${amt.toFixed(2)}\`,
                    amount: amt,
                    is_debit: false,
                    badge: 'MEDICINE',
                    badge_color: '#d97706',
                    time: time,
                    patient_id: v ? v.patient_id : null,
                    first_name: v ? v.first_name : null,
                    last_name: v ? v.last_name : null,
                    skinssence_id: v ? v.skinssence_id : null,
                    mobile: v ? v.mobile : null,
                    patient_name: pName,
                    visit_id: m.visit_id,
                    medicine_id: m.id
                  });
                });`;

  const newMedsLoop = `// 3. Medicines (Consolidated per patient visit — eliminates individual line duplication)
                const medsByVisit = new Map();
                meds.forEach(m => {
                  const vId = m.visit_id;
                  if (!medsByVisit.has(vId)) {
                    medsByVisit.set(vId, []);
                  }
                  medsByVisit.get(vId).push(m);
                });

                medsByVisit.forEach((vMeds, vId) => {
                  const v = visits.find(vr => vr.visit_id === vId);
                  const pName = v ? \`\${v.first_name || ''} \${v.last_name || ''}\`.trim() : 'Patient';
                  const pId = v ? (v.skinssence_id || \`S-\${v.patient_id}\`) : '';
                  const time = v ? formatISTTime(v.visit_date) : '';
                  const visitMedsTotal = vMeds.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);

                  const medNamesList = vMeds.map(m => parseMedicineDetails(m.details).name).filter(Boolean);
                  const summaryText = medNamesList.length > 0
                    ? (medNamesList.length > 3 ? \`\${medNamesList.slice(0, 3).join(', ')} + \${medNamesList.length - 3} more\` : medNamesList.join(', '))
                    : 'Pharmacy medicines';

                  timeline.push({
                    id: \`medvisit-\${vId}\`,
                    category: 'MEDICINES',
                    category_label: 'Pharmacy Collection',
                    title: \`\${pName} (\${pId}) — Pharmacy (\${vMeds.length} \${vMeds.length === 1 ? 'item' : 'items'})\`,
                    subtitle: \`\${summaryText} • Total ₹\${visitMedsTotal.toLocaleString('en-IN')}\`,
                    amount: visitMedsTotal,
                    is_debit: false,
                    badge: \`PHARMACY (\${vMeds.length} ITEMS)\`,
                    badge_color: '#d97706',
                    time: time,
                    patient_id: v ? v.patient_id : null,
                    first_name: v ? v.first_name : null,
                    last_name: v ? v.last_name : null,
                    skinssence_id: v ? v.skinssence_id : null,
                    mobile: v ? v.mobile : null,
                    patient_name: pName,
                    visit_id: vId,
                    items_count: vMeds.length
                  });
                });`;

  if (content.includes(oldMedsLoop)) {
    content = content.replace(oldMedsLoop, newMedsLoop);
  }

  // Also in /api/admin/diary response: include financial_reports and session_status!
  const oldDiaryRes = `res.json({
                  date: targetDate,
                  summary: {
                    total_visits: totalVisitsCount,
                    consultation_revenue: consultationRevenue,
                    procedure_revenue: procedureRevenue,`;

  const newDiaryRes = `// Fetch session reports and status for this date
                const financialReports = await calculateSessionFinancialReports(targetDate);
                const sessionStatus = await getActiveSessionForDate(targetDate);

                res.json({
                  date: targetDate,
                  active_session_num: sessionStatus.session_num,
                  can_transact: sessionStatus.can_transact,
                  active_session_name: sessionStatus.active_session_name,
                  session_1: sessionStatus.s1 || {
                    session_date: targetDate,
                    session_number: 1,
                    status: 'OPEN',
                    opened_at: null,
                    closed_at: null
                  },
                  session_2: sessionStatus.s2 || {
                    session_date: targetDate,
                    session_number: 2,
                    status: sessionStatus.s1 && sessionStatus.s1.status === 'CLOSED' ? 'OPEN' : 'NOT_STARTED',
                    opened_at: sessionStatus.s1 ? sessionStatus.s1.closed_at : null,
                    closed_at: null
                  },
                  financial_reports: financialReports,
                  summary: {
                    procedure_collection: financialReports.full_day.procedure_collection,
                    medicine_collection: financialReports.full_day.medicine_collection,
                    grand_total: financialReports.full_day.grand_total,
                    total_visits: totalVisitsCount,
                    consultation_revenue: consultationRevenue,
                    procedure_revenue: procedureRevenue,`;

  if (content.includes(oldDiaryRes)) {
    content = content.replace(oldDiaryRes, newDiaryRes);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath} successfully!`);
}

updateServerCode('server.js');
updateServerCode('backend/server.js');
