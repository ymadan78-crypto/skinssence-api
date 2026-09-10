with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the hardcoded consultation fee logic with a DB-driven one
old_fetch_last_visit = """  const fetchLastVisit = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}/patients/${patient.id}/last-visit`, { headers: { Authorization: `Bearer ${token}` } });
      const lastDate = res.data.last_visit_date;
      if (!lastDate) {
        setConsultationFee(400);
        setConsultationNote('New patient (first visit)');
        return;
      }
      const daysDiff = Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        setConsultationFee(0);
        setConsultationNote(`Follow-up within 7 days (${daysDiff}d ago)`);
      } else if (daysDiff <= 14) {
        setConsultationFee(200);
        setConsultationNote(`Follow-up 7-14 days (${daysDiff}d ago)`);
      } else {
        setConsultationFee(400);
        setConsultationNote(`New consultation (${daysDiff}d since last visit)`);
      }
    } catch (e) {
      console.log('Error fetching last visit', e);
    }
  };"""

new_fetch_last_visit = """  const fetchLastVisit = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      // Fetch last visit date and admin-configured fee rules in parallel
      const [lastVisitRes, rulesRes] = await Promise.all([
        axios.get(`${API_URL}/patients/${patient.id}/last-visit`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/consultation-fee-rules`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      
      const lastDate = lastVisitRes.data.last_visit_date;
      const rules = rulesRes.data && rulesRes.data.length > 0 ? rulesRes.data : [
        { min_days: 0, max_days: 7, fee: 0, label: 'Follow-up within 7 days' },
        { min_days: 8, max_days: 14, fee: 200, label: 'Return visit 8-14 days' },
        { min_days: 15, max_days: null, fee: 400, label: 'New consultation (>14 days)' }
      ];
      
      if (!lastDate) {
        const defaultRule = rules.find(r => r.max_days === null || r.max_days === undefined) || rules[rules.length - 1];
        setConsultationFee(defaultRule ? defaultRule.fee : 400);
        setConsultationNote('New patient (first visit)');
        return;
      }
      
      const daysDiff = Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      
      // Apply rules in order
      let matched = null;
      for (const rule of rules.sort((a, b) => a.min_days - b.min_days)) {
        const withinMax = rule.max_days === null || rule.max_days === undefined || daysDiff <= rule.max_days;
        if (daysDiff >= rule.min_days && withinMax) {
          matched = rule;
          break;
        }
      }
      
      if (matched) {
        setConsultationFee(matched.fee);
        setConsultationNote(`${matched.label} (last visit: ${daysDiff}d ago)`);
      } else {
        setConsultationFee(400);
        setConsultationNote(`New consultation (${daysDiff}d since last visit)`);
      }
    } catch (e) {
      console.log('Error fetching last visit', e);
      setConsultationFee(400);
      setConsultationNote('New consultation (default)');
    }
  };"""

code = code.replace(old_fetch_last_visit, new_fetch_last_visit)

# Also auto-populate procedure amount from master_procedures standard_price when selected
old_select_proc = """  const selectMasterProc = (name) => {
    const newProcs = [...procedures];
    newProcs[activeProcIndex].name = name;
    setProcedures(newProcs);
    setShowProcModal(false);
  };"""

new_select_proc = """  const selectMasterProc = (proc) => {
    const name = typeof proc === 'string' ? proc : proc.name;
    const stdPrice = typeof proc === 'object' && proc.standard_price ? proc.standard_price.toString() : '';
    const newProcs = [...procedures];
    newProcs[activeProcIndex].name = name;
    if (stdPrice && stdPrice !== '0') {
      newProcs[activeProcIndex].amount = stdPrice;
    }
    setProcedures(newProcs);
    setShowProcModal(false);
  };"""

code = code.replace(old_select_proc, new_select_proc)

# Update the FlatList onPress for procedure selection to pass full object
old_onpress_proc = "onPress={() => selectMasterProc(item.name)}"
new_onpress_proc = "onPress={() => selectMasterProc(item)}"
code = code.replace(old_onpress_proc, new_onpress_proc, 1)

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("VisitEntryScreen updated — DB-driven fee rules + auto-price from procedures!")
