with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update GET /api/dashboard/today to be robust
old_today_dash = """app.get('/api/dashboard/today', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();
  
  // Get unique patients count
  db.get(
    `SELECT COUNT(DISTINCT patient_id) as patients FROM visits WHERE date(visit_date) = ?`,
    [today],
    (err, patRow) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Get total collection across all payments, packages, and wallet recharges
      db.get(
        `SELECT SUM(amount) as collection FROM (
          SELECT amount_received as amount FROM payments WHERE date(payment_date) = ?
          UNION ALL
          SELECT amount FROM wallet_transactions WHERE date(created_at) = ? AND type = 'CREDIT'
          UNION ALL
          SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ?
        )`,
        [today, today, today],
        (err, colRow) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ patients: patRow?.patients || 0, collection: colRow?.collection || 0 });
        }
      );
    }
  );
});"""

new_today_dash = """app.get('/api/dashboard/today', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();
  
  // Get unique patients count for today
  db.get(
    `SELECT COUNT(DISTINCT patient_id) as patients FROM visits WHERE date(visit_date) = ? OR visit_date LIKE ?`,
    [today, `${today}%`],
    (err, patRow) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Get total collection across all payments, packages, and wallet recharges
      db.get(
        `SELECT SUM(amount) as collection FROM (
          SELECT amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
          UNION ALL
          SELECT amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
          UNION ALL
          SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
        )`,
        [today, `${today}%`, today, `${today}%`, today, `${today}%`],
        (err, colRow) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ patients: patRow?.patients || 0, collection: colRow?.collection || 0 });
        }
      );
    }
  );
});

// Drill-Down: Detailed List of Today's Visited Patients & Billed Components
app.get('/api/dashboard/today-visits', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();

  const sql = `
    SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
           p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN users u ON v.staff_id = u.id
    WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
    ORDER BY v.id DESC
  `;

  db.all(sql, [today, `${today}%`], (err, visits) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!visits || visits.length === 0) return res.json([]);

    const vIds = visits.map(v => v.visit_id).join(',');

    db.all(`SELECT * FROM procedures WHERE visit_id IN (${vIds})`, [], (errP, procs) => {
      if (errP) return res.status(500).json({ error: errP.message });

      db.all(`SELECT * FROM medicines WHERE visit_id IN (${vIds})`, [], (errM, meds) => {
        if (errM) return res.status(500).json({ error: errM.message });

        db.all(`SELECT * FROM payments WHERE visit_id IN (${vIds})`, [], (errPay, pays) => {
          if (errPay) return res.status(500).json({ error: errPay.message });

          const fullVisits = visits.map(v => {
            const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
            const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
            const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);

            const cFee = parseFloat(v.consultation_fee) || 0;
            const procTotal = vProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = vMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const totalAmount = cFee + procTotal + medTotal;
            const amountPaid = vPays.reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);

            return {
              ...v,
              procedures: vProcs,
              medicines: vMeds,
              payments: vPays,
              consultation_fee: cFee,
              procedure_total: procTotal,
              medicine_total: medTotal,
              total_amount: totalAmount,
              amount_paid: amountPaid
            };
          });

          res.json(fullVisits);
        });
      });
    });
  });
});"""

if old_today_dash in code:
    code = code.replace(old_today_dash, new_today_dash)
    print("Updated GET /api/dashboard/today and added GET /api/dashboard/today-visits!")
else:
    print("Warning: old_today_dash not found in server.js")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully!")
