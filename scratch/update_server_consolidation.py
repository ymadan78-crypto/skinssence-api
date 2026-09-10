with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_endpoint = """// Drill-Down: Detailed List of Today's Visited Patients & Billed Components
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

new_endpoint = """// Drill-Down: Consolidated Today's Visited Patients (1 row per patient, aggregating all same-day entries)
app.get('/api/dashboard/today-visits', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();

  const sql = `
    SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
           p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN users u ON v.staff_id = u.id
    WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
    ORDER BY v.id ASC
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

          const patientMap = new Map();

          visits.forEach(v => {
            if (!patientMap.has(v.patient_id)) {
              patientMap.set(v.patient_id, {
                visit_id: v.visit_id,
                patient_id: v.patient_id,
                skinssence_id: v.skinssence_id,
                first_name: v.first_name,
                last_name: v.last_name,
                mobile: v.mobile,
                visit_ids: [],
                visit_date: v.visit_date,
                planned_procedures: v.planned_procedures || '',
                staff_name: v.staff_name,
                consultation_fee: 0,
                procedures: [],
                medicines: [],
                payments: [],
                procedure_total: 0,
                medicine_total: 0,
                total_amount: 0,
                amount_paid: 0
              });
            }

            const pat = patientMap.get(v.patient_id);
            pat.visit_ids.push(v.visit_id);

            const cFee = parseFloat(v.consultation_fee) || 0;
            pat.consultation_fee += cFee;

            const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
            vProcs.forEach(p => {
              pat.procedures.push(p);
              pat.procedure_total += (parseFloat(p.amount) || 0);
            });

            const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
            vMeds.forEach(m => {
              pat.medicines.push(m);
              pat.medicine_total += (parseFloat(m.amount) || 0);
            });

            const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);
            vPays.forEach(p => {
              pat.payments.push(p);
              pat.amount_paid += (parseFloat(p.amount_received) || 0);
            });

            if (v.planned_procedures && !pat.planned_procedures) {
              pat.planned_procedures = v.planned_procedures;
            }
          });

          const consolidated = Array.from(patientMap.values()).map(pat => {
            pat.total_amount = pat.consultation_fee + pat.procedure_total + pat.medicine_total;
            return pat;
          });

          res.json(consolidated);
        });
      });
    });
  });
});"""

if old_endpoint in code:
    code = code.replace(old_endpoint, new_endpoint)
    print("Updated GET /api/dashboard/today-visits with consolidated logic in server.js!")
else:
    print("Warning: old_endpoint not found in server.js")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully!")
