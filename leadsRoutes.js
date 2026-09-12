// backend/leadsRoutes.js
// Phase 1: Skinssence Potential Client / Lead Management System

function normalizeIndianMobile(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setupLeadRoutes(app, db, authenticateToken, writeAudit) {
  // -------------------------------------------------------------
  // 1. DATABASE SCHEMA INITIALIZATION (ADDITIVE & SAFE)
  // -------------------------------------------------------------
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    normalized_mobile TEXT NOT NULL,
    alternate_mobile TEXT,
    source TEXT NOT NULL DEFAULT 'Phone Call',
    caller_name_suggested TEXT,
    treatment_interest TEXT,
    secondary_treatment_interest TEXT,
    skin_concern TEXT,
    hair_concern TEXT,
    notes TEXT,
    conversation_summary TEXT,
    budget_info TEXT,
    preferred_visit_timing TEXT,
    urgency TEXT DEFAULT 'Normal',
    previous_treatment TEXT,
    previous_clinic TEXT,
    objections TEXT,
    lead_temperature TEXT DEFAULT 'Warm',
    customer_intent TEXT DEFAULT 'Interested',
    next_recommended_action TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    followup_date TEXT,
    followup_time TEXT,
    assigned_staff TEXT,
    assigned_staff_id INTEGER,
    converted_patient_s_id TEXT,
    appointment_id INTEGER,
    is_archived INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_contact_at DATETIME
  )`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS lead_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    interaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    staff_id INTEGER,
    staff_name TEXT,
    summary TEXT,
    notes TEXT,
    appointment_id INTEGER,
    recording_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS lead_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    followup_date TEXT NOT NULL,
    followup_time TEXT,
    reason TEXT,
    assigned_staff TEXT,
    assigned_staff_id INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    completion_notes TEXT,
    completed_at DATETIME,
    completed_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {});

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON leads(lead_id)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_norm_mobile ON leads(normalized_mobile)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_followup_date ON leads(followup_date)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_followups_lead_id ON lead_followups(lead_id)`, () => {});
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_followups_status_date ON lead_followups(status, followup_date)`, () => {});

  // Helper: Generate next sequential Lead ID: L-00001, L-00002...
  const generateNextLeadId = (callback) => {
    db.get(`SELECT MAX(CAST(SUBSTR(lead_id, 3) AS INTEGER)) as max_num FROM leads WHERE lead_id LIKE 'L-%'`, [], (err, row) => {
      const nextNum = (row && row.max_num) ? (row.max_num + 1) : 1;
      const padded = String(nextNum).padStart(5, '0');
      callback(`L-${padded}`);
    });
  };

  // Helper: Generate next Patient S-ID (reuses logic from server.js)
  const generateNextPatientId = (callback) => {
    db.get(`
      SELECT MAX(num) as max_num FROM (
        SELECT CAST(SUBSTR(skinssence_id, 2) AS INTEGER) as num FROM patients WHERE skinssence_id LIKE 'S%'
        UNION
        SELECT CAST(SUBSTR(legacy_s_number, 2) AS INTEGER) as num FROM legacy_patients_master WHERE legacy_s_number LIKE 'S%'
      )
    `, [], (err, row) => {
      const maxNum = (row && row.max_num) ? row.max_num : 3107;
      callback(`S${maxNum + 1}`);
    });
  };

  // -------------------------------------------------------------
  // 2. DUPLICATE CHECK ENDPOINT
  // -------------------------------------------------------------
  app.get('/api/leads/check-duplicate', authenticateToken, (req, res) => {
    const rawMobile = req.query.mobile;
    if (!rawMobile) return res.json({ existingPatient: null, existingLead: null });

    const normMobile = normalizeIndianMobile(rawMobile);
    if (!normMobile || normMobile.length < 5) {
      return res.json({ existingPatient: null, existingLead: null });
    }

    // 1. Search in Patients
    const patientSql = `
      SELECT id, skinssence_id, first_name, last_name, mobile, city 
      FROM patients 
      WHERE mobile LIKE ? OR mobile LIKE ? OR mobile = ?
      LIMIT 1
    `;
    const patientParams = [`%${normMobile}%`, `%${normMobile.slice(-10)}%`, rawMobile];

    db.get(patientSql, patientParams, (errP, ptRow) => {
      if (errP) console.error('Duplicate check patient error:', errP);

      // 2. Search in Leads
      const leadSql = `
        SELECT id, lead_id, name, mobile, status, source, created_at 
        FROM leads 
        WHERE (normalized_mobile = ? OR mobile LIKE ?) AND is_archived = 0
        LIMIT 1
      `;
      const leadParams = [normMobile, `%${normMobile}%`];

      db.get(leadSql, leadParams, (errL, ldRow) => {
        if (errL) console.error('Duplicate check lead error:', errL);

        res.json({
          normalizedMobile: normMobile,
          existingPatient: ptRow ? {
            id: ptRow.id,
            skinssence_id: ptRow.skinssence_id,
            name: `${ptRow.first_name || ''} ${ptRow.last_name || ''}`.trim(),
            mobile: ptRow.mobile,
            city: ptRow.city
          } : null,
          existingLead: ldRow ? {
            id: ldRow.id,
            lead_id: ldRow.lead_id,
            name: ldRow.name,
            mobile: ldRow.mobile,
            status: ldRow.status,
            source: ldRow.source,
            created_at: ldRow.created_at
          } : null
        });
      });
    });
  });

  // -------------------------------------------------------------
  // 3. FOLLOW-UP DASHBOARD ENDPOINT (TODAY, OVERDUE, UPCOMING)
  // -------------------------------------------------------------
  app.get('/api/leads/followups/dashboard', authenticateToken, (req, res) => {
    const today = getTodayString();

    const sql = `
      SELECT f.*, l.name, l.mobile, l.treatment_interest, l.lead_temperature, l.status as lead_status, l.source
      FROM lead_followups f
      JOIN leads l ON f.lead_id = l.lead_id
      WHERE f.status = 'PENDING' AND l.is_archived = 0
      ORDER BY f.followup_date ASC, f.followup_time ASC
    `;

    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const all = rows || [];
      const todayList = all.filter(r => r.followup_date === today);
      const overdueList = all.filter(r => r.followup_date < today);
      const upcomingList = all.filter(r => r.followup_date > today);

      res.json({
        today: todayList,
        overdue: overdueList,
        upcoming: upcomingList,
        counts: {
          today: todayList.length,
          overdue: overdueList.length,
          upcoming: upcomingList.length,
          total_pending: all.length
        }
      });
    });
  });

  // -------------------------------------------------------------
  // 4. GET LEADS LIST WITH FILTERS, SEARCH, & COUNTS
  // -------------------------------------------------------------
  app.get('/api/leads', authenticateToken, (req, res) => {
    const { search, status, source, treatment, limit = 100, offset = 0 } = req.query;

    let whereClauses = ['is_archived = 0'];
    let params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      const normQ = normalizeIndianMobile(search.trim());
      if (normQ && normQ.length >= 4) {
        whereClauses.push('(name LIKE ? OR mobile LIKE ? OR normalized_mobile LIKE ? OR lead_id LIKE ?)');
        params.push(q, q, `%${normQ}%`, q);
      } else {
        whereClauses.push('(name LIKE ? OR mobile LIKE ? OR lead_id LIKE ?)');
        params.push(q, q, q);
      }
    }

    if (status && status !== 'ALL') {
      whereClauses.push('status = ?');
      params.push(status);
    }

    if (source && source !== 'ALL') {
      whereClauses.push('source = ?');
      params.push(source);
    }

    if (treatment && treatment !== 'ALL') {
      whereClauses.push('treatment_interest LIKE ?');
      params.push(`%${treatment}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const listSql = `
      SELECT id, lead_id, name, mobile, normalized_mobile, source, treatment_interest,
             status, lead_temperature, urgency, followup_date, followup_time,
             assigned_staff, converted_patient_s_id, created_at, last_contact_at
      FROM leads
      ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit, 10), parseInt(offset, 10));

    db.all(listSql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Query quick stats
      const today = getTodayString();
      const statsSql = `
        SELECT 
          COUNT(*) as total_leads,
          SUM(CASE WHEN status = 'Converted to Patient' THEN 1 ELSE 0 END) as converted_count,
          SUM(CASE WHEN status = 'Interested' THEN 1 ELSE 0 END) as interested_count,
          SUM(CASE WHEN followup_date = ? AND status != 'Converted to Patient' THEN 1 ELSE 0 END) as due_today_count,
          SUM(CASE WHEN followup_date < ? AND status != 'Converted to Patient' AND followup_date IS NOT NULL AND followup_date != '' THEN 1 ELSE 0 END) as overdue_count
        FROM leads
        WHERE is_archived = 0
      `;

      db.get(statsSql, [today, today], (errStats, statsRow) => {
        res.json({
          leads: rows || [],
          stats: {
            total: statsRow?.total_leads || 0,
            converted: statsRow?.converted_count || 0,
            interested: statsRow?.interested_count || 0,
            dueToday: statsRow?.due_today_count || 0,
            overdue: statsRow?.overdue_count || 0
          }
        });
      });
    });
  });

  // -------------------------------------------------------------
  // 5. CREATE NEW LEAD
  // -------------------------------------------------------------
  app.post('/api/leads', authenticateToken, (req, res) => {
    const {
      name,
      mobile,
      alternate_mobile,
      source = 'Phone Call',
      caller_name_suggested,
      treatment_interest,
      secondary_treatment_interest,
      skin_concern,
      hair_concern,
      notes,
      conversation_summary,
      budget_info,
      preferred_visit_timing,
      urgency = 'Normal',
      previous_treatment,
      previous_clinic,
      objections,
      lead_temperature = 'Warm',
      customer_intent = 'Interested',
      next_recommended_action,
      status = 'New',
      followup_date,
      followup_time,
      assigned_staff
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Lead name is required' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ error: 'Lead mobile number is required' });
    }

    const normMobile = normalizeIndianMobile(mobile);
    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';

    generateNextLeadId((newLeadId) => {
      const insertSql = `
        INSERT INTO leads (
          lead_id, name, mobile, normalized_mobile, alternate_mobile, source,
          caller_name_suggested, treatment_interest, secondary_treatment_interest,
          skin_concern, hair_concern, notes, conversation_summary, budget_info,
          preferred_visit_timing, urgency, previous_treatment, previous_clinic,
          objections, lead_temperature, customer_intent, next_recommended_action,
          status, followup_date, followup_time, assigned_staff, assigned_staff_id,
          created_by, last_contact_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const params = [
        newLeadId,
        name.trim(),
        mobile.trim(),
        normMobile,
        alternate_mobile ? alternate_mobile.trim() : null,
        source,
        caller_name_suggested || null,
        Array.isArray(treatment_interest) ? treatment_interest.join(', ') : (treatment_interest || null),
        secondary_treatment_interest || null,
        skin_concern || null,
        hair_concern || null,
        notes || null,
        conversation_summary || null,
        budget_info || null,
        preferred_visit_timing || null,
        urgency,
        previous_treatment || null,
        previous_clinic || null,
        objections || null,
        lead_temperature,
        customer_intent,
        next_recommended_action || null,
        status,
        followup_date || null,
        followup_time || null,
        assigned_staff || userName,
        userId,
        userId
      ];

      db.run(insertSql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const newDbId = this.lastID;

        // 1. Record initial interaction
        const initialSummary = `Enquiry received via ${source}${treatment_interest ? ` for ${Array.isArray(treatment_interest) ? treatment_interest.join(', ') : treatment_interest}` : ''}`;
        db.run(`
          INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [newLeadId, source, userId, userName, initialSummary, notes || null]);

        // 2. Schedule initial follow-up if date provided
        if (followup_date) {
          db.run(`
            INSERT INTO lead_followups (lead_id, followup_date, followup_time, reason, assigned_staff, assigned_staff_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
          `, [newLeadId, followup_date, followup_time || '11:00 AM', next_recommended_action || 'Initial follow-up discussion', assigned_staff || userName, userId]);
        }

        // 3. Write to Audit Log
        if (typeof writeAudit === 'function') {
          writeAudit(req.user, 'LEAD_CREATED', 'leads', newLeadId, null, {
            lead_id: newLeadId,
            name: name.trim(),
            mobile: mobile.trim(),
            source,
            treatment: treatment_interest
          }, 'Created new potential client lead');
        }

        res.status(201).json({
          message: 'Lead created successfully',
          lead_id: newLeadId,
          id: newDbId
        });
      });
    });
  });

  // -------------------------------------------------------------
  // 6. GET SINGLE LEAD WITH INTERACTIONS & FOLLOW-UPS
  // -------------------------------------------------------------
  app.get('/api/leads/:lead_id', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;

    db.get('SELECT * FROM leads WHERE lead_id = ?', [leadId], (err, lead) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      // Fetch interactions
      db.all(
        'SELECT * FROM lead_interactions WHERE lead_id = ? ORDER BY id DESC',
        [leadId],
        (errI, interactions) => {
          if (errI) console.error('Error fetching interactions:', errI);

          // Fetch follow-ups
          db.all(
            'SELECT * FROM lead_followups WHERE lead_id = ? ORDER BY id DESC',
            [leadId],
            (errF, followups) => {
              if (errF) console.error('Error fetching followups:', errF);

              res.json({
                lead,
                interactions: interactions || [],
                followups: followups || []
              });
            }
          );
        }
      );
    });
  });

  // -------------------------------------------------------------
  // 7. UPDATE LEAD
  // -------------------------------------------------------------
  app.put('/api/leads/:lead_id', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;

    db.get('SELECT * FROM leads WHERE lead_id = ?', [leadId], (err, current) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!current) return res.status(404).json({ error: 'Lead not found' });

      const b = req.body;
      const updatedMobile = b.mobile !== undefined ? b.mobile.trim() : current.mobile;
      const updatedNormMobile = b.mobile !== undefined ? normalizeIndianMobile(b.mobile) : current.normalized_mobile;

      const sql = `
        UPDATE leads SET
          name = COALESCE(?, name),
          mobile = ?,
          normalized_mobile = ?,
          alternate_mobile = COALESCE(?, alternate_mobile),
          source = COALESCE(?, source),
          treatment_interest = COALESCE(?, treatment_interest),
          secondary_treatment_interest = COALESCE(?, secondary_treatment_interest),
          skin_concern = COALESCE(?, skin_concern),
          hair_concern = COALESCE(?, hair_concern),
          notes = COALESCE(?, notes),
          conversation_summary = COALESCE(?, conversation_summary),
          budget_info = COALESCE(?, budget_info),
          preferred_visit_timing = COALESCE(?, preferred_visit_timing),
          urgency = COALESCE(?, urgency),
          previous_treatment = COALESCE(?, previous_treatment),
          previous_clinic = COALESCE(?, previous_clinic),
          objections = COALESCE(?, objections),
          lead_temperature = COALESCE(?, lead_temperature),
          customer_intent = COALESCE(?, customer_intent),
          next_recommended_action = COALESCE(?, next_recommended_action),
          status = COALESCE(?, status),
          assigned_staff = COALESCE(?, assigned_staff),
          updated_at = CURRENT_TIMESTAMP
        WHERE lead_id = ?
      `;

      const params = [
        b.name !== undefined ? b.name.trim() : null,
        updatedMobile,
        updatedNormMobile,
        b.alternate_mobile !== undefined ? b.alternate_mobile : null,
        b.source !== undefined ? b.source : null,
        Array.isArray(b.treatment_interest) ? b.treatment_interest.join(', ') : (b.treatment_interest !== undefined ? b.treatment_interest : null),
        b.secondary_treatment_interest !== undefined ? b.secondary_treatment_interest : null,
        b.skin_concern !== undefined ? b.skin_concern : null,
        b.hair_concern !== undefined ? b.hair_concern : null,
        b.notes !== undefined ? b.notes : null,
        b.conversation_summary !== undefined ? b.conversation_summary : null,
        b.budget_info !== undefined ? b.budget_info : null,
        b.preferred_visit_timing !== undefined ? b.preferred_visit_timing : null,
        b.urgency !== undefined ? b.urgency : null,
        b.previous_treatment !== undefined ? b.previous_treatment : null,
        b.previous_clinic !== undefined ? b.previous_clinic : null,
        b.objections !== undefined ? b.objections : null,
        b.lead_temperature !== undefined ? b.lead_temperature : null,
        b.customer_intent !== undefined ? b.customer_intent : null,
        b.next_recommended_action !== undefined ? b.next_recommended_action : null,
        b.status !== undefined ? b.status : null,
        b.assigned_staff !== undefined ? b.assigned_staff : null,
        leadId
      ];

      db.run(sql, params, function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        if (typeof writeAudit === 'function') {
          writeAudit(req.user, 'LEAD_EDITED', 'leads', leadId, current, b, 'Updated lead information');
        }

        res.json({ message: 'Lead updated successfully' });
      });
    });
  });

  // -------------------------------------------------------------
  // 8. UPDATE LEAD STATUS DIRECTLY
  // -------------------------------------------------------------
  app.put('/api/leads/:lead_id/status', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;
    const { status, reason } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required' });

    db.get('SELECT status FROM leads WHERE lead_id = ?', [leadId], (err, current) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!current) return res.status(404).json({ error: 'Lead not found' });

      const oldStatus = current.status;
      db.run(
        'UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE lead_id = ?',
        [status, leadId],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          // Record interaction
          const userId = req.user?.id || 1;
          const userName = req.user?.username || 'Staff';
          db.run(`
            INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
            VALUES (?, 'Status Change', ?, ?, ?, ?)
          `, [leadId, userId, userName, `Status updated: ${oldStatus} → ${status}`, reason || null]);

          if (typeof writeAudit === 'function') {
            writeAudit(req.user, 'LEAD_STATUS_CHANGED', 'leads', leadId, { status: oldStatus }, { status }, reason || 'Status updated');
          }

          res.json({ message: 'Status updated successfully', oldStatus, newStatus: status });
        }
      );
    });
  });

  // -------------------------------------------------------------
  // 9. RECORD AN INTERACTION (CALL, WHATSAPP, NOTE)
  // -------------------------------------------------------------
  app.post('/api/leads/:lead_id/interactions', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;
    const { interaction_type = 'Note', summary, notes, appointment_id } = req.body;

    if (!summary && !notes) {
      return res.status(400).json({ error: 'Summary or notes required' });
    }

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';

    db.run(`
      INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes, appointment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [leadId, interaction_type, userId, userName, summary || interaction_type, notes || null, appointment_id || null], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Update lead's last_contact_at
      db.run('UPDATE leads SET last_contact_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE lead_id = ?', [leadId]);

      if (typeof writeAudit === 'function') {
        writeAudit(req.user, 'LEAD_INTERACTION_ADDED', 'leads', leadId, null, { interaction_type, summary }, notes);
      }

      res.status(201).json({ message: 'Interaction recorded', id: this.lastID });
    });
  });

  // -------------------------------------------------------------
  // 10. CREATE / SCHEDULE FOLLOW-UP
  // -------------------------------------------------------------
  app.post('/api/leads/:lead_id/followups', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;
    const { followup_date, followup_time = '11:00 AM', reason, assigned_staff } = req.body;

    if (!followup_date) {
      return res.status(400).json({ error: 'Follow-up date is required (YYYY-MM-DD)' });
    }

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';
    const staff = assigned_staff || userName;

    db.run(`
      INSERT INTO lead_followups (lead_id, followup_date, followup_time, reason, assigned_staff, assigned_staff_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `, [leadId, followup_date, followup_time, reason || 'Follow-up discussion', staff, userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Update lead master record
      db.run(`
        UPDATE leads SET 
          followup_date = ?, 
          followup_time = ?, 
          assigned_staff = ?,
          status = CASE WHEN status IN ('New', 'Contacted') THEN 'Follow-up Due' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE lead_id = ?
      `, [followup_date, followup_time, staff, leadId]);

      // Record interaction
      db.run(`
        INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
        VALUES (?, 'Follow-up Scheduled', ?, ?, ?, ?)
      `, [leadId, userId, userName, `Scheduled follow-up for ${followup_date} at ${followup_time}`, reason || null]);

      if (typeof writeAudit === 'function') {
        writeAudit(req.user, 'LEAD_FOLLOWUP_CREATED', 'leads', leadId, null, { followup_date, followup_time, reason }, 'Follow-up scheduled');
      }

      res.status(201).json({ message: 'Follow-up scheduled successfully', id: this.lastID });
    });
  });

  // -------------------------------------------------------------
  // 11. COMPLETE FOLLOW-UP
  // -------------------------------------------------------------
  app.put('/api/leads/followups/:followup_id/complete', authenticateToken, (req, res) => {
    const followupId = req.params.followup_id;
    const {
      completion_notes,
      next_followup_date,
      next_followup_time = '11:00 AM',
      next_followup_reason,
      lead_status
    } = req.body;

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';

    db.get('SELECT * FROM lead_followups WHERE id = ?', [followupId], (err, followup) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!followup) return res.status(404).json({ error: 'Follow-up not found' });

      const leadId = followup.lead_id;

      // Mark completed
      db.run(`
        UPDATE lead_followups SET
          status = 'COMPLETED',
          completion_notes = ?,
          completed_at = CURRENT_TIMESTAMP,
          completed_by = ?
        WHERE id = ?
      `, [completion_notes || 'Completed by staff', userId, followupId], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        // Record interaction history
        db.run(`
          INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
          VALUES (?, 'Follow-up Completed', ?, ?, ?, ?)
        `, [leadId, userId, userName, `Completed follow-up: ${completion_notes || 'No outcome notes'}`, followup.reason || null]);

        // If next follow-up is scheduled
        if (next_followup_date) {
          db.run(`
            INSERT INTO lead_followups (lead_id, followup_date, followup_time, reason, assigned_staff, assigned_staff_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
          `, [leadId, next_followup_date, next_followup_time, next_followup_reason || 'Next follow-up', userName, userId]);

          db.run(`
            UPDATE leads SET
              followup_date = ?,
              followup_time = ?,
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE lead_id = ?
          `, [next_followup_date, next_followup_time, lead_status || null, leadId]);
        } else {
          // Clear active follow-up from lead master
          db.run(`
            UPDATE leads SET
              followup_date = NULL,
              followup_time = NULL,
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE lead_id = ?
          `, [lead_status || null, leadId]);
        }

        if (typeof writeAudit === 'function') {
          writeAudit(req.user, 'LEAD_FOLLOWUP_COMPLETED', 'leads', leadId, followup, {
            completion_notes,
            next_followup_date
          }, 'Completed follow-up');
        }

        res.json({ message: 'Follow-up marked completed' });
      });
    });
  });

  // -------------------------------------------------------------
  // 12. CONVERT LEAD TO PATIENT (OR LINK TO EXISTING)
  // -------------------------------------------------------------
  app.post('/api/leads/:lead_id/convert-to-patient', authenticateToken, (req, res) => {
    const leadId = req.params.lead_id;
    const { action = 'CREATE_NEW', existing_s_id, patient_data } = req.body;
    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';

    db.get('SELECT * FROM leads WHERE lead_id = ?', [leadId], (err, lead) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      // Option A: Link to Existing Patient
      if (action === 'LINK_EXISTING') {
        if (!existing_s_id) {
          return res.status(400).json({ error: 'Existing Patient S-Number is required' });
        }

        db.get('SELECT id, skinssence_id, first_name, last_name FROM patients WHERE skinssence_id = ?', [existing_s_id.trim().toUpperCase()], (errP, existingPt) => {
          if (errP) return res.status(500).json({ error: errP.message });
          if (!existingPt) return res.status(404).json({ error: `Patient ${existing_s_id} not found in database` });

          const patientSId = existingPt.skinssence_id;

          db.run(`
            UPDATE leads SET
              converted_patient_s_id = ?,
              status = 'Converted to Patient',
              updated_at = CURRENT_TIMESTAMP
            WHERE lead_id = ?
          `, [patientSId, leadId], function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });

            // Record interaction
            db.run(`
              INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
              VALUES (?, 'Conversion', ?, ?, ?, ?)
            `, [leadId, userId, userName, `Linked to existing Patient ${patientSId} (${existingPt.first_name} ${existingPt.last_name || ''})`, 'Lead successfully linked']);

            if (typeof writeAudit === 'function') {
              writeAudit(req.user, 'LEAD_CONVERTED_LINKED', 'leads', leadId, { converted_patient_s_id: lead.converted_patient_s_id }, { converted_patient_s_id: patientSId }, `Linked lead to existing patient ${patientSId}`);
            }

            res.json({
              success: true,
              skinssence_id: patientSId,
              message: `Lead ${leadId} successfully linked to existing Patient ${patientSId}`
            });
          });
        });
        return;
      }

      // Option B: Create Brand-New Patient
      const pd = patient_data || {};
      const nameParts = (pd.name || lead.name || '').trim().split(' ');
      const firstName = pd.first_name || nameParts[0] || 'Unknown';
      const lastName = pd.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.');
      const mobile = pd.mobile || lead.mobile;
      const city = pd.city || 'Kota';
      const gender = pd.gender || 'Female';
      const dob = pd.dob || null;
      const email = pd.email || null;
      const address = pd.address || null;

      generateNextPatientId((newSkinssenceId) => {
        db.run(`
          INSERT INTO patients (skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [newSkinssenceId, firstName, lastName, mobile, dob, gender, email, address, city], function(errIns) {
          if (errIns) return res.status(500).json({ error: errIns.message });

          const newPatientDbId = this.lastID;

          // Add skin concern record
          const concerns = lead.treatment_interest ? [lead.treatment_interest] : [];
          db.run(`
            INSERT INTO skin_concerns (patient_id, concerns, other_concern)
            VALUES (?, ?, ?)
          `, [newPatientDbId, JSON.stringify(concerns), lead.skin_concern || lead.notes || null]);

          // Update Lead record
          db.run(`
            UPDATE leads SET
              converted_patient_s_id = ?,
              status = 'Converted to Patient',
              updated_at = CURRENT_TIMESTAMP
            WHERE lead_id = ?
          `, [newSkinssenceId, leadId], function(errUpd) {
            if (errUpd) console.error('Error updating lead with converted S-ID:', errUpd);

            // Record interaction
            db.run(`
              INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
              VALUES (?, 'Conversion', ?, ?, ?, ?)
            `, [leadId, userId, userName, `Converted to new Patient ${newSkinssenceId} (${firstName} ${lastName})`, 'Initial enquiry converted to registered patient']);

            if (typeof writeAudit === 'function') {
              writeAudit(req.user, 'LEAD_CONVERTED_NEW', 'leads', leadId, null, {
                lead_id: leadId,
                skinssence_id: newSkinssenceId,
                patient_id: newPatientDbId
              }, `Converted lead ${leadId} into new patient ${newSkinssenceId}`);
            }

            res.json({
              success: true,
              skinssence_id: newSkinssenceId,
              patient_id: newPatientDbId,
              message: `Lead ${leadId} successfully converted into Patient ${newSkinssenceId}`
            });
          });
        });
      });
    });
  });
}

module.exports = {
  setupLeadRoutes,
  normalizeIndianMobile
};
