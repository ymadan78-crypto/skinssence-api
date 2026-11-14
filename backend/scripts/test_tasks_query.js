const db = require('../db');

function parseDob(dobStr) {
  if (!dobStr) return null;
  const s = dobStr.trim();
  let day, month, year;
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) {
      if (p[0].length === 4) { year = parseInt(p[0], 10); month = parseInt(p[1], 10); day = parseInt(p[2], 10); }
      else { day = parseInt(p[0], 10); month = parseInt(p[1], 10); year = parseInt(p[2], 10); }
    }
  } else if (s.includes('-')) {
    const p = s.split('-');
    if (p.length === 3) {
      if (p[0].length === 4) { year = parseInt(p[0], 10); month = parseInt(p[1], 10); day = parseInt(p[2], 10); }
      else { day = parseInt(p[0], 10); month = parseInt(p[1], 10); year = parseInt(p[2], 10); }
    }
  }
  if (!day || !month || isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

async function testTasks() {
  const dateStr = '2026-11-12';
  
  // 1. Visiting patients today with review status
  const visiting = await db.allAsync(`
    SELECT v.id as visit_id, v.patient_id, v.visit_date, v.planned_procedures, v.net_payable,
           p.skinssence_id, p.first_name, p.last_name, p.mobile,
           (SELECT COUNT(*) FROM patient_review_requests prr WHERE prr.patient_id = p.id AND date(prr.requested_at) = ?) as review_sent_count
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    WHERE date(v.visit_date) = ?
    ORDER BY v.id DESC
  `, [dateStr, dateStr]).catch(async () => {
    // If table patient_review_requests doesn't exist yet:
    return await db.allAsync(`
      SELECT v.id as visit_id, v.patient_id, v.visit_date, v.planned_procedures, v.net_payable,
             p.skinssence_id, p.first_name, p.last_name, p.mobile,
             0 as review_sent_count
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE date(v.visit_date) = ?
      ORDER BY v.id DESC
    `, [dateStr]);
  });

  console.log('Today visiting patients:', visiting.length);
  process.exit(0);
}

testTasks().catch(console.error);
