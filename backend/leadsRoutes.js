// backend/leadsRoutes.js
// Phase 1: Skinssence Potential Client / Lead Management System

function normalizeIndianMobile(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  // Format 1: Exactly 10 digits starting with 6, 7, 8, or 9
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  // Format 2: 11 digits starting with 0 followed by 6-9
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]\d{9}$/.test(digits.slice(1))) {
    return digits.slice(1);
  }
  // Format 3: 12 digits starting with 91 followed by 6-9
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  // Invalid mobile format (do not extract random substrings)
  return '';
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

  db.run(`CREATE TABLE IF NOT EXISTS clinic_device_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    designated_by_id INTEGER,
    designated_by_name TEXT,
    designated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {});

  db.run(`CREATE INDEX IF NOT EXISTS idx_clinic_device_key ON clinic_device_config(config_key)`, () => {});

  // Safe additive migrations for AI Call Recording
  db.run(`ALTER TABLE leads ADD COLUMN ai_transcript TEXT`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN ai_summary_json TEXT`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN recording_file_name TEXT`, () => {});
  db.run(`ALTER TABLE leads ADD COLUMN recording_status TEXT DEFAULT 'NO_RECORDING'`, () => {});
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
    if (!rawMobile) {
      return res.json({
        normalizedMobile: null,
        existingPatient: null,
        existingLead: null,
        isPatientMatch: false,
        isLeadMatch: false,
        priorityAction: 'CREATE_LEAD'
      });
    }

    const normMobile = normalizeIndianMobile(rawMobile);
    if (!normMobile) {
      // Invalid format rejected directly
      return res.status(400).json({
        error: 'Invalid Indian mobile number. Must be 10 digits starting with 6-9 (optional +91, 91, or 0).',
        normalizedMobile: null,
        existingPatient: null,
        existingLead: null,
        isPatientMatch: false,
        isLeadMatch: false,
        priorityAction: 'INVALID_NUMBER'
      });
    }

    // 1. Search in Patients (Exact 10-digit normalized comparison key)
    // Matches exact 10 digits, +91/91/0 prefix, or formatted variation like "9829012345 - Name"
    const patientSql = `
      SELECT id, skinssence_id, first_name, last_name, mobile, dob, gender, city, email, address
      FROM patients 
      WHERE mobile = ?
         OR mobile = ?
         OR mobile = ?
         OR mobile = ?
         OR mobile LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `;
    const patientParams = [
      normMobile,
      `+91${normMobile}`,
      `91${normMobile}`,
      `0${normMobile}`,
      `${normMobile}%`
    ];

    db.get(patientSql, patientParams, (errP, ptRow) => {
      if (errP) console.error('Duplicate check patient error:', errP);

      // 2. Search in Leads (Exact normalized comparison key)
      const leadSql = `
        SELECT id, lead_id, name, mobile, normalized_mobile, status, source, created_at, treatment_interest
        FROM leads 
        WHERE normalized_mobile = ? AND is_archived = 0
        ORDER BY id DESC
        LIMIT 1
      `;
      const leadParams = [normMobile];

      db.get(leadSql, leadParams, (errL, ldRow) => {
        if (errL) console.error('Duplicate check lead error:', errL);

        const patientObj = ptRow ? {
          id: ptRow.id,
          skinssence_id: ptRow.skinssence_id,
          first_name: ptRow.first_name || '',
          last_name: ptRow.last_name || '',
          name: `${ptRow.first_name || ''} ${ptRow.last_name || ''}`.trim(),
          mobile: ptRow.mobile,
          dob: ptRow.dob || null,
          gender: ptRow.gender || null,
          city: ptRow.city || null,
          email: ptRow.email || null,
          address: ptRow.address || null
        } : null;

        const leadObj = ldRow ? {
          id: ldRow.id,
          lead_id: ldRow.lead_id,
          name: ldRow.name,
          mobile: ldRow.mobile,
          normalized_mobile: ldRow.normalized_mobile,
          status: ldRow.status,
          source: ldRow.source,
          treatment_interest: ldRow.treatment_interest,
          created_at: ldRow.created_at
        } : null;

        // PATIENT TAKES ABSOLUTE PRIORITY OVER LEAD
        let priorityAction = 'CREATE_LEAD';
        if (patientObj) {
          priorityAction = 'OPEN_PATIENT';
        } else if (leadObj) {
          priorityAction = 'OPEN_LEAD';
        }

        res.json({
          normalizedMobile: normMobile,
          existingPatient: patientObj,
          existingLead: leadObj,
          isPatientMatch: !!patientObj,
          isLeadMatch: !patientObj && !!leadObj,
          priorityAction
        });
      });
    });
  });

  // -------------------------------------------------------------
  // 2B. LOG CALL ACTIVITY FOR EXISTING PATIENT
  // (Ensures call is not lost while preventing Lead duplication)
  // -------------------------------------------------------------
  app.post('/api/leads/log-patient-call', authenticateToken, (req, res) => {
    const { patient_id, skinssence_id, call_type = 'Incoming Call', call_outcome, notes } = req.body;
    if (!patient_id && !skinssence_id) {
      return res.status(400).json({ error: 'patient_id or skinssence_id is required' });
    }

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';
    const auditSummary = `${call_type}: ${call_outcome || 'Received call'}${notes ? ` - ${notes}` : ''}`;

    if (typeof writeAudit === 'function') {
      writeAudit(req.user, 'PATIENT_CALL_LOGGED', 'patients', String(skinssence_id || patient_id), null, {
        patient_id,
        skinssence_id,
        call_type,
        call_outcome,
        notes,
        logged_by: userName
      }, auditSummary);
    }

    res.json({
      message: 'Patient call activity logged successfully',
      success: true,
      patient_id: patient_id || skinssence_id,
      call_outcome,
      logged_at: new Date().toISOString()
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
    if (!normMobile) {
      return res.status(400).json({ error: 'Invalid Indian mobile number. Must be 10 digits starting with 6-9.' });
    }

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Staff';

    // 1. CHECK PATIENT MASTER (Patient takes absolute priority, do NOT create Lead)
    const checkPatientSql = `
      SELECT id, skinssence_id, first_name, last_name, mobile, city, dob 
      FROM patients 
      WHERE mobile = ? OR mobile = ? OR mobile = ? OR mobile = ? OR mobile LIKE ?
      LIMIT 1
    `;
    const patientParams = [normMobile, `+91${normMobile}`, `91${normMobile}`, `0${normMobile}`, `${normMobile}%`];

    db.get(checkPatientSql, patientParams, (errP, existingPt) => {
      if (errP) console.error('Error checking patient table:', errP);
      if (existingPt) {
        return res.status(409).json({
          error: `This mobile number belongs to existing Patient: ${existingPt.first_name || ''} ${existingPt.last_name || ''} (${existingPt.skinssence_id}). Please open their Patient Profile instead.`,
          isPatient: true,
          patient: {
            id: existingPt.id,
            skinssence_id: existingPt.skinssence_id,
            name: `${existingPt.first_name || ''} ${existingPt.last_name || ''}`.trim(),
            mobile: existingPt.mobile,
            city: existingPt.city,
            dob: existingPt.dob
          }
        });
      }

      // 2. CHECK EXISTING ACTIVE LEAD (Prevent duplicate lead creation, log call activity under existing lead)
      const checkLeadSql = `
        SELECT id, lead_id, name, mobile, normalized_mobile, status, source
        FROM leads 
        WHERE normalized_mobile = ? AND is_archived = 0
        LIMIT 1
      `;
      db.get(checkLeadSql, [normMobile], (errL, existingLead) => {
        if (errL) console.error('Error checking existing lead:', errL);

        if (existingLead) {
          // Log new call interaction under existing lead and update last_contact_at
          const interactionSummary = `Repeated call received via ${source}${treatment_interest ? ` regarding ${Array.isArray(treatment_interest) ? treatment_interest.join(', ') : treatment_interest}` : ''}`;
          db.run(`
            INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [existingLead.lead_id, source, userId, userName, interactionSummary, notes || null]);

          db.run(`UPDATE leads SET last_contact_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [existingLead.id]);

          // Also update followup if requested
          if (followup_date) {
            db.run(`
              INSERT INTO lead_followups (lead_id, followup_date, followup_time, reason, assigned_staff, assigned_staff_id, status)
              VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            `, [existingLead.lead_id, followup_date, followup_time || '11:00 AM', next_recommended_action || 'Follow-up on repeat call', assigned_staff || userName, userId]);
          }

          return res.status(200).json({
            message: `Lead ${existingLead.lead_id} (${existingLead.name}) already exists. Call activity has been recorded against existing Lead.`,
            lead_id: existingLead.lead_id,
            id: existingLead.id,
            isExisting: true
          });
        }

        // 3. CREATE NEW LEAD (Zero patient/S-number creation)
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

            // Record initial interaction
            const initialSummary = `Enquiry received via ${source}${treatment_interest ? ` for ${Array.isArray(treatment_interest) ? treatment_interest.join(', ') : treatment_interest}` : ''}`;
            db.run(`
              INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [newLeadId, source, userId, userName, initialSummary, notes || null]);

            // Schedule initial follow-up if date provided
            if (followup_date) {
              db.run(`
                INSERT INTO lead_followups (lead_id, followup_date, followup_time, reason, assigned_staff, assigned_staff_id, status)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
              `, [newLeadId, followup_date, followup_time || '11:00 AM', next_recommended_action || 'Initial follow-up discussion', assigned_staff || userName, userId]);
            }

            // Write to Audit Log
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

  // -------------------------------------------------------------
  // 14. GET CLINIC PHONE DESIGNATION STATUS
  // -------------------------------------------------------------
  app.get('/api/leads/clinic-device/status', authenticateToken, (req, res) => {
    const callerDeviceId = req.query.device_id || req.headers['x-device-id'] || '';

    db.get(
      `SELECT device_id, device_name, designated_by_id, designated_by_name, designated_at, updated_at
       FROM clinic_device_config
       WHERE config_key = 'designated_clinic_phone'`,
      [],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!row) {
          return res.json({
            is_configured: false,
            is_current_device: false,
            designated_device: null,
            message: 'No clinic phone is currently designated'
          });
        }

        const isCurrent = Boolean(callerDeviceId && callerDeviceId.trim() === row.device_id);

        res.json({
          is_configured: true,
          is_current_device: isCurrent,
          designated_device: {
            device_id: row.device_id,
            device_name: row.device_name,
            designated_by_name: row.designated_by_name,
            designated_at: row.designated_at,
            updated_at: row.updated_at
          }
        });
      }
    );
  });

  // -------------------------------------------------------------
  // 15. DESIGNATE / TRANSFER CLINIC PHONE (ADMIN / DOCTOR ONLY)
  // -------------------------------------------------------------
  app.post('/api/leads/clinic-device/designate', authenticateToken, (req, res) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'DOCTOR') {
      return res.status(403).json({ error: 'Access denied. Only an Admin or Doctor can designate the clinic phone.' });
    }

    const { device_id, device_name, override_existing } = req.body;
    if (!device_id || !device_name) {
      return res.status(400).json({ error: 'device_id and device_name are required' });
    }

    const userId = req.user?.id || 1;
    const userName = req.user?.username || 'Admin';

    // Check if another device is currently designated
    db.get(
      `SELECT device_id, device_name FROM clinic_device_config WHERE config_key = 'designated_clinic_phone'`,
      [],
      (err, current) => {
        if (err) return res.status(500).json({ error: err.message });

        if (current && current.device_id !== device_id && !override_existing) {
          return res.status(409).json({
            conflict: true,
            current_device_name: current.device_name,
            current_device_id: current.device_id,
            message: `Another phone is already designated as the Clinic Phone ("${current.device_name}"). Transfer designation to this device?`
          });
        }

        // Upsert designated clinic phone
        const sql = `
          INSERT INTO clinic_device_config (
            config_key, device_id, device_name, designated_by_id, designated_by_name, designated_at, updated_at
          ) VALUES ('designated_clinic_phone', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(config_key) DO UPDATE SET
            device_id = excluded.device_id,
            device_name = excluded.device_name,
            designated_by_id = excluded.designated_by_id,
            designated_by_name = excluded.designated_by_name,
            designated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `;

        db.run(sql, [device_id, device_name, userId, userName], function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          if (typeof writeAudit === 'function') {
            writeAudit(req.user, 'CLINIC_PHONE_DESIGNATED', 'clinic_device_config', 'designated_clinic_phone', current, {
              device_id,
              device_name,
              designated_by_name: userName
            }, `Designated "${device_name}" as the active clinic call/lead phone`);
          }

          res.json({
            success: true,
            message: `"${device_name}" is now designated as the single Clinic Call & Lead Phone`,
            designated_device: {
              device_id,
              device_name,
              designated_by_name: userName,
              designated_at: new Date().toISOString()
            }
          });
        });
      }
    );
  });

  // -------------------------------------------------------------
  // 16. REVOKE CLINIC PHONE DESIGNATION (ADMIN / DOCTOR ONLY)
  // -------------------------------------------------------------
  app.post('/api/leads/clinic-device/revoke', authenticateToken, (req, res) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'DOCTOR') {
      return res.status(403).json({ error: 'Access denied. Only an Admin or Doctor can revoke the clinic phone designation.' });
    }

    db.get(`SELECT * FROM clinic_device_config WHERE config_key = 'designated_clinic_phone'`, [], (err, current) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!current) {
        return res.json({ success: true, message: 'No clinic phone was designated' });
      }

      db.run(`DELETE FROM clinic_device_config WHERE config_key = 'designated_clinic_phone'`, [], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        if (typeof writeAudit === 'function') {
          writeAudit(req.user, 'CLINIC_PHONE_REVOKED', 'clinic_device_config', 'designated_clinic_phone', current, null, 'Revoked clinic phone designation');
        }

        res.json({
          success: true,
          message: 'Clinic phone designation revoked. All phones are now in personal staff mode.'
        });
      });
    });
  });

  // -------------------------------------------------------------
  // 17. AI CALL RECORDING TRANSCRIPTION & CRM INTERPRETATION
  // -------------------------------------------------------------
  app.post('/api/leads/ai-transcribe-call', authenticateToken, async (req, res) => {
    try {
      const {
        audio_base64,
        audio_mime_type = 'audio/mp3',
        recording_file_name = '',
        mobile = '',
        caller_name = '',
        call_type = 'INCOMING',
        call_duration = 0,
        call_timestamp = ''
      } = req.body;

      if (!audio_base64) {
        return res.status(400).json({ error: 'Audio base64 data is required for transcription.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;

      const normMobile = normalizeIndianMobile(mobile);

      // Check if caller is an existing Patient in clinic master
      const existingPatient = await new Promise((resolve) => {
        if (!normMobile) return resolve(null);
        const patientSql = `
          SELECT id, skinssence_id, first_name, last_name, mobile
          FROM patients 
          WHERE mobile = ?
             OR mobile = ?
             OR mobile = ?
             OR mobile = ?
             OR mobile LIKE ?
          ORDER BY id DESC
          LIMIT 1
        `;
        const patientParams = [
          normMobile,
          `+91${normMobile}`,
          `91${normMobile}`,
          `0${normMobile}`,
          `${normMobile}%`
        ];
        db.get(patientSql, patientParams, (err, row) => {
          if (err || !row) resolve(null);
          else resolve({
            id: row.id,
            skinssence_id: row.skinssence_id,
            name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
            mobile: row.mobile
          });
        });
      });

      if (!apiKey) {
        // Fallback simulation when GEMINI_API_KEY is not configured yet
        console.warn('[AI Transcribe] GEMINI_API_KEY not configured. Providing structured template fallback.');
        const fallbackClassification = existingPatient ? 'EXISTING_CLIENT' : 'POTENTIAL_CLIENT';
        const fallbackSummary = {
          call_classification: fallbackClassification,
          lead_intent: 'APPOINTMENT_ENQUIRY',
          lead_name: existingPatient ? existingPatient.name : (caller_name || 'Caller'),
          phone_number: mobile || '',
          call_type: call_type || 'INCOMING',
          service_interest: 'Skin Rejuvenation',
          main_concern: 'Inquiry about clinic skin treatments, pricing, and doctor consultation timings.',
          questions_asked: ['Doctor consultation fee and clinic timings', 'Available procedure options'],
          price_discussed: 'Standard consultation fee discussed',
          appointment_requested: true,
          preferred_appointment: 'Upcoming weekend / Morning',
          appointment_booked: false,
          appointment_date: '',
          appointment_time: '',
          follow_up_required: true,
          follow_up_date: getTodayString(),
          urgency: 'Normal',
          lead_temperature: 'Warm',
          patient_objections: 'None noted',
          staff_action_required: 'Follow up on WhatsApp with doctor availability and service catalog',
          important_notes: 'Audio recorded on clinic phone. Connect GEMINI_API_KEY for live multilingual Google Gemini 1.5 Flash.',
          transcript: `[Patient]: Namaste doctor saab / reception se baat ho rahi hai? Mujhe appointment ke bare me janna tha.\n[Staff]: Namaste! Skinssence Clinic me swagat hai. Ji batayein, kis treatment ke regarding consult karna chahte hain?\n[Patient]: Skin glow and treatment timings ke bare me janna tha.\n[Staff]: Bilkul, hamare yahan Dr. Ashima se consultation available hai. Aapko weekend ya weekday kab suit karega?\n[Patient]: Main check karke batata hoon.`,
          confidence: 0.85,
          existing_patient: existingPatient || null,
          is_simulated: true
        };

        return res.json({
          success: true,
          ai_summary: fallbackSummary,
          recording_file_name,
          notice: 'Transcribed using offline CRM structure. Set GEMINI_API_KEY for live multilingual Google Gemini 1.5 Flash.'
        });
      }

      // Multimodal Gemini 1.5 Flash Audio Request
      const prompt = `You are an expert AI clinical receptionist and CRM assistant for Skinssence Aesthetic & Dermatology Clinic.
Analyze this recorded telephone call between clinic staff and a caller.
The conversation may be in Hindi, English, or Hinglish (mixed Hindi-English).

Tasks:
1. Classify the call into EXACTLY ONE of these 6 categories:
   - "POTENTIAL_CLIENT" (New prospective patient inquiring about aesthetic/dermatology treatments, consultation, or pricing)
   - "EXISTING_CLIENT" (Current registered patient inquiring about medicines, post-procedure questions, test results, or next follow-up)
   - "SUPPLIER_VENDOR" (Medical representative, pharma distributor, courier, equipment supplier, marketing agency)
   - "STAFF_INTERNAL" (Doctor, clinic staff member, partner calling for internal administrative work)
   - "SPAM_WRONG_NUMBER" (Telemarketing, banks, wrong number, blank call)
   - "OTHER" (General non-clinical query or unclassified)

2. Determine the Lead Intent:
   - "PRICE_ENQUIRY"
   - "INFO_ENQUIRY"
   - "APPOINTMENT_ENQUIRY"
   - "APPOINTMENT_BOOKED"
   - "FOLLOWUP_REQUIRED"
   - "OTHER"

3. Provide a verbatim or high-fidelity transcript, labeling speakers as [Staff] and [Patient] (or caller).

4. Extract structured CRM information in strict JSON matching this exact structure:

{
  "call_classification": "POTENTIAL_CLIENT, EXISTING_CLIENT, SUPPLIER_VENDOR, STAFF_INTERNAL, SPAM_WRONG_NUMBER, or OTHER",
  "lead_intent": "PRICE_ENQUIRY, INFO_ENQUIRY, APPOINTMENT_ENQUIRY, APPOINTMENT_BOOKED, FOLLOWUP_REQUIRED, or OTHER",
  "lead_name": "Caller name if mentioned, else empty string",
  "phone_number": "${mobile || ''}",
  "call_type": "${call_type || 'INCOMING'}",
  "service_interest": "Exact treatment category from this list: Laser Hair Removal, Acne, Acne Scars, Pigmentation, Melasma, Hair Loss, PRP/GFC, Hydrafacial, Carbon Laser, Tattoo Removal, Under-eye, Skin Rejuvenation, Other",
  "main_concern": "Primary clinical, aesthetic, or query concern discussed",
  "questions_asked": ["Specific questions asked by the caller"],
  "price_discussed": "Specific price, package cost, or budget mentioned, or 'Not Discussed'",
  "appointment_requested": false,
  "preferred_appointment": "Preferred date, day of week, or time mentioned",
  "appointment_booked": false,
  "appointment_date": "",
  "appointment_time": "",
  "follow_up_required": true,
  "follow_up_date": "${getTodayString()}",
  "urgency": "High, Normal, or Low",
  "lead_temperature": "Hot, Warm, or Cold",
  "patient_objections": "Any hesitation or objections raised",
  "staff_action_required": "Exact next action clinic staff should take",
  "important_notes": "Key clinical or customer service highlights",
  "transcript": "Full formatted transcript with [Staff] and [Patient] labels",
  "confidence": 0.95
}

Return ONLY valid JSON. Do not include markdown formatting.`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: audio_mime_type || 'audio/mp3',
                    data: audio_base64
                  }
                },
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Gemini Audio Error]', response.status, errText);
        return res.status(502).json({ error: `Gemini API returned error ${response.status}: ${errText}` });
      }

      const geminiData = await response.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      let parsedJson = {};
      try {
        const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.warn('[Gemini Audio] Could not parse strict JSON, raw text returned:', rawText);
        parsedJson = {
          call_classification: 'POTENTIAL_CLIENT',
          lead_intent: 'INFO_ENQUIRY',
          lead_name: caller_name || 'Caller',
          phone_number: mobile,
          service_interest: 'Other',
          main_concern: 'Call recorded',
          transcript: rawText,
          confidence: 0.5
        };
      }

      // Enforce Patient Priority Rule: If number belongs to an existing registered patient
      if (existingPatient) {
        parsedJson.existing_patient = existingPatient;
        if (parsedJson.call_classification === 'POTENTIAL_CLIENT') {
          parsedJson.call_classification = 'EXISTING_CLIENT';
        }
      }

      res.json({
        success: true,
        ai_summary: parsedJson,
        recording_file_name,
        processing_status: 'COMPLETED'
      });
    } catch (err) {
      console.error('[AI Transcribe] Internal Error:', err);
      res.status(500).json({ error: err.message || 'Failed to transcribe audio' });
    }
  });

  // -------------------------------------------------------------
  // 18. CONFIRM & COMMIT AI SUMMARY TO POTENTIAL LEADS
  // -------------------------------------------------------------
  app.post('/api/leads/ai-confirm-lead', authenticateToken, (req, res) => {
    const {
      lead_id,
      name,
      mobile,
      treatment_interest,
      main_concern,
      notes,
      conversation_summary,
      budget_info,
      preferred_visit_timing,
      urgency = 'Normal',
      lead_temperature = 'Warm',
      status = 'New',
      followup_date,
      followup_time,
      ai_transcript = '',
      ai_summary_json = '',
      recording_file_name = ''
    } = req.body;

    const normMobile = normalizeIndianMobile(mobile);
    if (!normMobile) {
      return res.status(400).json({ error: 'Valid 10-digit Indian mobile number is required.' });
    }

    const staffId = req.user?.id || 1;
    const staffName = req.user?.name || 'Staff';

    // Helper: Add interaction
    const logInteraction = (targetLeadId) => {
      db.run(
        `INSERT INTO lead_interactions (lead_id, interaction_type, staff_id, staff_name, summary, notes, recording_ref)
         VALUES (?, 'CALL_AI_INTERPRETED', ?, ?, ?, ?, ?)`,
        [
          targetLeadId,
          staffId,
          staffName,
          conversation_summary || `AI Call Recording Interpreted (${treatment_interest || 'Inquiry'})`,
          notes || '',
          recording_file_name || ''
        ],
        () => {}
      );
    };

    if (lead_id) {
      // Update existing lead
      db.run(
        `UPDATE leads SET
          name = COALESCE(NULLIF(?, ''), name),
          treatment_interest = COALESCE(NULLIF(?, ''), treatment_interest),
          skin_concern = COALESCE(NULLIF(?, ''), skin_concern),
          notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END,
          conversation_summary = ?,
          budget_info = ?,
          preferred_visit_timing = ?,
          urgency = ?,
          lead_temperature = ?,
          status = ?,
          followup_date = ?,
          followup_time = ?,
          ai_transcript = ?,
          ai_summary_json = ?,
          recording_file_name = ?,
          recording_status = 'COMPLETED',
          updated_at = CURRENT_TIMESTAMP,
          last_contact_at = CURRENT_TIMESTAMP
         WHERE lead_id = ?`,
        [
          name || '',
          treatment_interest || '',
          main_concern || '',
          notes || '',
          notes || '',
          conversation_summary || '',
          budget_info || '',
          preferred_visit_timing || '',
          urgency,
          lead_temperature,
          status,
          followup_date || null,
          followup_time || null,
          ai_transcript,
          typeof ai_summary_json === 'object' ? JSON.stringify(ai_summary_json) : ai_summary_json,
          recording_file_name,
          lead_id
        ],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          logInteraction(lead_id);
          res.json({ success: true, lead_id, message: 'Lead updated with AI Call Recording summary.' });
        }
      );
    } else {
      // Check if lead already exists by normalized_mobile
      db.get(`SELECT lead_id FROM leads WHERE normalized_mobile = ?`, [normMobile], (err, existing) => {
        if (!err && existing) {
          // Update existing
          db.run(
            `UPDATE leads SET
              name = COALESCE(NULLIF(?, ''), name),
              treatment_interest = COALESCE(NULLIF(?, ''), treatment_interest),
              skin_concern = COALESCE(NULLIF(?, ''), skin_concern),
              notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END,
              conversation_summary = ?,
              budget_info = ?,
              preferred_visit_timing = ?,
              urgency = ?,
              lead_temperature = ?,
              status = ?,
              followup_date = ?,
              followup_time = ?,
              ai_transcript = ?,
              ai_summary_json = ?,
              recording_file_name = ?,
              recording_status = 'COMPLETED',
              updated_at = CURRENT_TIMESTAMP,
              last_contact_at = CURRENT_TIMESTAMP
             WHERE lead_id = ?`,
            [
              name || '',
              treatment_interest || '',
              main_concern || '',
              notes || '',
              notes || '',
              conversation_summary || '',
              budget_info || '',
              preferred_visit_timing || '',
              urgency,
              lead_temperature,
              status,
              followup_date || null,
              followup_time || null,
              ai_transcript,
              typeof ai_summary_json === 'object' ? JSON.stringify(ai_summary_json) : ai_summary_json,
              recording_file_name,
              existing.lead_id
            ],
            function(err2) {
              if (err2) return res.status(500).json({ error: err2.message });
              logInteraction(existing.lead_id);
              res.json({ success: true, lead_id: existing.lead_id, message: 'Existing lead updated with AI Call Recording summary.' });
            }
          );
        } else {
          // Create new Lead ID
          db.get(`SELECT MAX(id) as max_id FROM leads`, [], (err3, row) => {
            const nextSeq = ((row?.max_id || 0) + 1).toString().padStart(4, '0');
            const newLeadId = `L-${nextSeq}`;

            db.run(
              `INSERT INTO leads (
                lead_id, name, mobile, normalized_mobile, source,
                treatment_interest, skin_concern, notes, conversation_summary,
                budget_info, preferred_visit_timing, urgency, lead_temperature,
                status, followup_date, followup_time, assigned_staff, assigned_staff_id,
                ai_transcript, ai_summary_json, recording_file_name, recording_status,
                created_by, created_at, updated_at, last_contact_at
              ) VALUES (?, ?, ?, ?, 'Phone Call Recording', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [
                newLeadId,
                name || `Lead ${normMobile.slice(-4)}`,
                mobile,
                normMobile,
                treatment_interest || '',
                main_concern || '',
                notes || '',
                conversation_summary || '',
                budget_info || '',
                preferred_visit_timing || '',
                urgency,
                lead_temperature,
                status,
                followup_date || null,
                followup_time || null,
                staffName,
                staffId,
                ai_transcript,
                typeof ai_summary_json === 'object' ? JSON.stringify(ai_summary_json) : ai_summary_json,
                recording_file_name,
                staffId
              ],
              function(err4) {
                if (err4) return res.status(500).json({ error: err4.message });
                logInteraction(newLeadId);
                res.json({ success: true, lead_id: newLeadId, message: 'New potential lead created from AI Call Recording summary.' });
              }
            );
          });
        }
      });
    }
  });

}

module.exports = {
  setupLeadRoutes,
  normalizeIndianMobile
};
