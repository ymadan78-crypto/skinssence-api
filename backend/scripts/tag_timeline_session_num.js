const fs = require('fs');

function patchServer(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Let's check if getItemSessionNum is already added
  if (!content.includes('function getItemSessionNum')) {
    const diaryTimelineMarker = '// --- UNIFIED TIMELINE ENTRIES ---';
    const helperCode = `// --- UNIFIED TIMELINE ENTRIES ---
                const s1ClosedAt = (sessionStatus?.s1 && sessionStatus.s1.closed_at) ? sessionStatus.s1.closed_at : null;
                function getItemSessionNum(itemDate, explicitSessionNum) {
                  if (explicitSessionNum === 1 || explicitSessionNum === 2) return explicitSessionNum;
                  if (!itemDate) return 1;
                  if (s1ClosedAt) return (itemDate <= s1ClosedAt) ? 1 : 2;
                  const timePart = itemDate.includes('T') ? itemDate.split('T')[1] : '';
                  const hour = parseInt(timePart.slice(0, 2), 10) || 12;
                  return hour < 10 ? 1 : 2;
                }
`;
    content = content.replace(diaryTimelineMarker, helperCode);
  }

  // Add session_num to consultations
  content = content.replace(
    /id: `cons-\${v\.visit_id}`,([\s\S]*?)visit_id: v\.visit_id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('visit_id: v.visit_id', 'visit_id: v.visit_id,\n                      session_num: getItemSessionNum(v.visit_date)');
    }
  );

  // Add session_num to package sale
  content = content.replace(
    /id: `procpkg-\${p\.id}`,([\s\S]*?)visit_id: p\.visit_id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('visit_id: p.visit_id', 'visit_id: p.visit_id,\n                      session_num: getItemSessionNum(v ? v.visit_date : targetDate)');
    }
  );

  // Add session_num to package session redemption
  content = content.replace(
    /id: `procred-\${p\.id}`,([\s\S]*?)visit_id: p\.visit_id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('visit_id: p.visit_id', 'visit_id: p.visit_id,\n                      session_num: getItemSessionNum(v ? v.visit_date : targetDate)');
    }
  );

  // Add session_num to procedure
  content = content.replace(
    /id: `proc-\${p\.id}`,([\s\S]*?)visit_id: p\.visit_id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('visit_id: p.visit_id', 'visit_id: p.visit_id,\n                      session_num: getItemSessionNum(v ? v.visit_date : targetDate)');
    }
  );

  // Add session_num to consolidated medicines
  content = content.replace(
    /id: `medvisit-\${vId}`,([\s\S]*?)items_count: vMeds\.length\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('items_count: vMeds.length', 'items_count: vMeds.length,\n                    session_num: getItemSessionNum(v ? v.visit_date : targetDate)');
    }
  );

  // Add session_num to payments
  content = content.replace(
    /id: `pay-\${pay\.id}`,([\s\S]*?)payment_id: pay\.id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('payment_id: pay.id', 'payment_id: pay.id,\n                    session_num: getItemSessionNum(pay.payment_date, pay.session_num)');
    }
  );

  // Add session_num to expenses
  content = content.replace(
    /id: `exp-\${e\.id}`,([\s\S]*?)expense_id: e\.id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('expense_id: e.id', 'expense_id: e.id,\n                    session_num: getItemSessionNum(e.expense_date || e.created_at)');
    }
  );

  // Add session_num to appointments
  content = content.replace(
    /id: `appt-\${a\.id}`,([\s\S]*?)appointment_id: a\.id\s*}/,
    (match) => {
      if (match.includes('session_num:')) return match;
      return match.replace('appointment_id: a.id', 'appointment_id: a.id,\n                    session_num: getItemSessionNum(a.appointment_date)');
    }
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Patched timeline session_num in ${filePath}`);
}

patchServer('server.js');
patchServer('backend/server.js');
