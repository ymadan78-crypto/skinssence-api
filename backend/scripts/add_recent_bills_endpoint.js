const fs = require('fs');

function addRecentBillsEndpoint(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes("app.get('/api/pharmacy/recent-bills'")) {
    console.log(`Already has endpoint in ${filePath}`);
    return;
  }

  const target = "// 1. Get complete pharmacy sale details for inspection & modal\napp.get('/api/admin/pharmacy/sales/:visit_id'";
  const targetCRLF = target.replace(/\n/g, '\r\n');

  const endpointCode = `// 0. Get recent pharmacy bills for quick search and edit
app.get('/api/pharmacy/recent-bills', authenticateToken, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const limit = parseInt(req.query.limit, 10) || 40;

    let sql = \`
      SELECT DISTINCT v.id as visit_id, v.patient_id, v.visit_date, v.created_at,
             v.consultation_fee, v.subtotal, v.discount_amount, v.net_payable,
             p.first_name, p.last_name, p.mobile, p.skinssence_id
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN medicines m ON m.visit_id = v.id
    \`;
    const params = [];

    if (search) {
      sql += \` WHERE (p.first_name LIKE ? OR p.last_name LIKE ? OR p.mobile LIKE ? OR p.skinssence_id LIKE ? OR CAST(v.id AS TEXT) = ?)\`;
      params.push(\`%\${search}%\`, \`%\${search}%\`, \`%\${search}%\`, \`%\${search}%\`, search);
    }

    sql += \` ORDER BY v.visit_date DESC, v.id DESC LIMIT ?\`;
    params.push(limit);

    const rows = await db.allAsync(sql, params);

    if (rows && rows.length > 0) {
      const vIds = rows.map(r => r.visit_id);
      const placeholders = vIds.map(() => '?').join(',');
      const allMeds = await db.allAsync(\`SELECT * FROM medicines WHERE visit_id IN (\${placeholders}) ORDER BY id ASC\`, vIds);
      const allPays = await db.allAsync(\`SELECT * FROM payments WHERE visit_id IN (\${placeholders}) ORDER BY id ASC\`, vIds);

      rows.forEach(r => {
        r.medicines = (allMeds || []).filter(m => m.visit_id === r.visit_id);
        r.payments = (allPays || []).filter(p => p.visit_id === r.visit_id);
        r.patient_name = \`\${r.first_name || ''} \${r.last_name || ''}\`.trim();
      });
    }

    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching recent pharmacy bills:', err);
    res.status(500).json({ error: err.message });
  }
});

`;

  let matched = false;
  if (content.includes(target)) {
    content = content.replace(target, endpointCode + target);
    matched = true;
  } else if (content.includes(targetCRLF)) {
    content = content.replace(targetCRLF, endpointCode.replace(/\n/g, '\r\n') + targetCRLF);
    matched = true;
  }

  if (!matched) {
    throw new Error(`Target not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Added endpoint to ${filePath}`);
}

addRecentBillsEndpoint('server.js');
addRecentBillsEndpoint('backend/server.js');
