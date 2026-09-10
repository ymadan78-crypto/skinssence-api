with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Start procedures with [] (empty array)
code = code.replace("const [procedures, setProcedures] = useState([{ name: '', area: '', amount: '' }]);",
                    "const [procedures, setProcedures] = useState([]);")

# 2. Update calculation & submit logic
old_submit = """    const validProcs = procedures.filter(p => p.name.trim() !== '');

    if (entryMode === 'STANDARD' && validProcs.length === 0 && pharmacyMeds.length === 0 && cFeeNum === 0) {
      Alert.alert('Incomplete', 'Please enter at least one procedure, consultation fee, or pharmacy bill.');
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      const payload = {
        patient_id: patient.id,
        notes: formData.notes,
        medicine_details: pharmacyMeds.map(m => m.details).join(', '),
        medicine_amount: pharmacyTotal,
        payment_mode: formData.payment_mode,
        amount_received: parseFloat(formData.amount_received) || 0,
        planned_procedures: formData.planned_procedures
      };

      if (isPastVisit) payload.visit_date = visitDate.toISOString();

      if (entryMode === 'STANDARD') {
        const cFeeProc = cFeeNum > 0
          ? [{ name: 'Consultation Fee', area: '', amount: cFeeNum }]
          : [];
        payload.procedures = [...cFeeProc, ...validProcs.map(p => ({ name: p.name, area: p.area, amount: parseFloat(p.amount) || 0 }))];
      } else if (entryMode === 'REDEEM_PACKAGE') {"""

new_submit = """    const validProcs = procedures.filter(p => p.name && p.name.trim() !== '');
    const hasConsultation = cFeeNum > 0;
    const hasProcedures = validProcs.length > 0;
    const hasPharmacy = pharmacyMeds.length > 0;

    if (entryMode === 'STANDARD' && !hasConsultation && !hasProcedures && !hasPharmacy) {
      Alert.alert('Incomplete Entry', 'Please enter a consultation fee, add a procedure, or sync a pharmacy bill.');
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      const payload = {
        patient_id: patient.id,
        notes: formData.notes,
        consultation_fee: cFeeNum,
        medicine_details: pharmacyMeds.map(m => m.details).join(', '),
        medicine_amount: pharmacyTotal,
        payment_mode: formData.payment_mode,
        amount_received: parseFloat(formData.amount_received) || 0,
        planned_procedures: formData.planned_procedures
      };

      if (isPastVisit) payload.visit_date = visitDate.toISOString();

      if (entryMode === 'STANDARD') {
        // Send real procedures only; consultation fee is stored in its dedicated field
        payload.procedures = validProcs.map(p => ({ name: p.name.trim(), area: p.area ? p.area.trim() : '', amount: parseFloat(p.amount) || 0 }));
      } else if (entryMode === 'REDEEM_PACKAGE') {"""

if old_submit in code:
    code = code.replace(old_submit, new_submit)
    print("Updated submit logic in VisitEntryScreen.js!")
else:
    print("Warning: old_submit not found in VisitEntryScreen.js")

# 3. Update Procedure section UI in VisitEntryScreen.js to handle 0 procedures smoothly
old_proc_ui = """          {entryMode === 'STANDARD' && (
            <>
              <Text style={styles.sectionTitle}>🏥 Procedures</Text>
              {procedures.map((proc, index) => (
                <View key={index} style={styles.procRow}>
                  <View style={{flex: 1, marginBottom: 10}}>
                    <Text style={styles.label}>Procedure Name / Category</Text>
                    <TouchableOpacity style={styles.dropdownBtn} onPress={() => { setActiveProcIndex(index); setShowProcModal(true); }}>
                      <Text style={{color: proc.name ? '#000' : '#888', fontSize: 16}}>{proc.name || 'Tap to select procedure...'}</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <View style={{flex: 1, marginRight: 10}}>
                      <Text style={styles.label}>Body Part / Area (Optional)</Text>
                      <TextInput style={styles.input} value={proc.area} onChangeText={(v) => updateProcedure(index, 'area', v)} placeholder="e.g. Full Face, Chin" />
                    </View>
                    <View style={{flex: 0.7}}>
                      <Text style={styles.label}>Amount (Rs)</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={proc.amount} onChangeText={(v) => updateProcedure(index, 'amount', v)} placeholder="0" />
                    </View>
                  </View>
                  {procedures.length > 1 && (
                    <TouchableOpacity onPress={() => removeProcedureRow(index)} style={{alignSelf: 'flex-end', marginTop: 10}}>
                      <Text style={{color: '#ef4444', fontWeight: 'bold'}}>✕ Remove Procedure</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{height: 1, backgroundColor: '#eee', marginVertical: 15}} />
                </View>
              ))}
              <TouchableOpacity style={styles.addProcBtn} onPress={addProcedureRow}>
                <Text style={styles.addProcBtnText}>+ Add Another Procedure</Text>
              </TouchableOpacity>
            </>
          )}"""

new_proc_ui = """          {entryMode === 'STANDARD' && (
            <>
              <Text style={styles.sectionTitle}>🏥 Procedures / Services</Text>
              {procedures.length === 0 ? (
                <View style={{ backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 12 }}>
                  <Text style={{ color: '#166534', fontWeight: 'bold', fontSize: 14 }}>🩺 Consultation Only Visit</Text>
                  <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                    No procedures performed. If patient received a treatment or service, tap "+ Add Procedure" below.
                  </Text>
                </View>
              ) : (
                procedures.map((proc, index) => (
                  <View key={index} style={styles.procRow}>
                    <View style={{flex: 1, marginBottom: 10}}>
                      <Text style={styles.label}>Procedure Name / Category</Text>
                      <TouchableOpacity style={styles.dropdownBtn} onPress={() => { setActiveProcIndex(index); setShowProcModal(true); }}>
                        <Text style={{color: proc.name ? '#000' : '#888', fontSize: 16}}>{proc.name || 'Tap to select procedure...'}</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <View style={{flex: 1, marginRight: 10}}>
                        <Text style={styles.label}>Body Part / Area (Optional)</Text>
                        <TextInput style={styles.input} value={proc.area} onChangeText={(v) => updateProcedure(index, 'area', v)} placeholder="e.g. Full Face, Chin" />
                      </View>
                      <View style={{flex: 0.7}}>
                        <Text style={styles.label}>Amount (Rs)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={proc.amount} onChangeText={(v) => updateProcedure(index, 'amount', v)} placeholder="0" />
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeProcedureRow(index)} style={{alignSelf: 'flex-end', marginTop: 10}}>
                      <Text style={{color: '#ef4444', fontWeight: 'bold'}}>✕ Remove Procedure</Text>
                    </TouchableOpacity>
                    <View style={{height: 1, backgroundColor: '#eee', marginVertical: 15}} />
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.addProcBtn} onPress={addProcedureRow}>
                <Text style={styles.addProcBtnText}>+ Add Procedure</Text>
              </TouchableOpacity>
            </>
          )}"""

if old_proc_ui in code:
    code = code.replace(old_proc_ui, new_proc_ui)
    print("Updated procedure UI in VisitEntryScreen.js!")
else:
    print("Warning: old_proc_ui not found in VisitEntryScreen.js")

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("VisitEntryScreen.js completely updated!")
