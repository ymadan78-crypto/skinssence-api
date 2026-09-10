with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add consultation fee state
code = code.replace(
    "const [loading, setLoading] = useState(false);\n  const [todayPharmacyBilled, setTodayPharmacyBilled] = useState(0);\n  const [fetchingPharmacy, setFetchingPharmacy] = useState(false);",
    "const [loading, setLoading] = useState(false);\n  const [todayPharmacyBilled, setTodayPharmacyBilled] = useState(0);\n  const [fetchingPharmacy, setFetchingPharmacy] = useState(false);\n  const [consultationFee, setConsultationFee] = useState(400);\n  const [consultationNote, setConsultationNote] = useState('New visit (>14 days)');"
)

# 2. Add fetchLastVisit call inside useEffect
code = code.replace(
    "fetchTodayPharmacy();",
    "fetchTodayPharmacy();\n    if (!isPastVisit) fetchLastVisit();"
)

# 3. Add fetchLastVisit function after fetchTodayPharmacy
fetch_last_visit = """
  const fetchLastVisit = async () => {
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
  };
"""
code = code.replace(
    "\n  const fetchMasterProcedures = async () => {",
    fetch_last_visit + "\n  const fetchMasterProcedures = async () => {"
)

# 4. Update the useEffect for auto-calculating amount_received to include consultation fee
code = code.replace(
    "      const procTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);\n      const mAmt = parseFloat(formData.medicine_amount) || 0;\n      const collectNow = procTotal + mAmt - todayPharmacyBilled;\n      setFormData(prev => ({ ...prev, amount_received: Math.max(0, collectNow).toString() }));",
    "      const procTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);\n      const mAmt = parseFloat(formData.medicine_amount) || 0;\n      const cFee = parseFloat(formData.consultation_fee) || 0;\n      const collectNow = procTotal + mAmt + cFee - todayPharmacyBilled;\n      setFormData(prev => ({ ...prev, amount_received: Math.max(0, collectNow).toString() }));"
)

# 5. Add consultation_fee to formData initial state
code = code.replace(
    "  const [formData, setFormData] = useState({\n    notes: '',",
    "  const [formData, setFormData] = useState({\n    consultation_fee: '400',\n    notes: '',"
)

# 6. Add consultation_fee to useEffect dependencies and sync when consultationFee changes
# Add useEffect to sync consultationFee into formData
sync_fee_effect = """
  // Sync auto-calculated consultation fee into formData
  useEffect(() => {
    if (!isPastVisit) {
      setFormData(prev => ({ ...prev, consultation_fee: consultationFee.toString() }));
    }
  }, [consultationFee]);
"""
code = code.replace(
    "  useEffect(() => {\n    if (entryMode === 'STANDARD') {",
    sync_fee_effect + "\n  useEffect(() => {\n    if (entryMode === 'STANDARD') {"
)

# 7. Add consultation_fee to useEffect dependency array for amount_received calculation
code = code.replace(
    "  }, [procedures, formData.medicine_amount, entryMode]);",
    "  }, [procedures, formData.medicine_amount, formData.consultation_fee, entryMode, todayPharmacyBilled]);"
)

# 8. Add consultation_fee to the payload sent to the server
code = code.replace(
    "      const payload = {\n        patient_id: patient.id,\n        notes: formData.notes,\n        medicine_details: formData.medicine_details,\n        medicine_amount: parseFloat(formData.medicine_amount) || 0,\n        payment_mode: formData.payment_mode,\n        amount_received: parseFloat(formData.amount_received) || 0,\n        planned_procedures: formData.planned_procedures\n      };",
    """      const cFee = parseFloat(formData.consultation_fee) || 0;
      const payload = {
        patient_id: patient.id,
        notes: formData.notes,
        medicine_details: formData.medicine_details,
        medicine_amount: parseFloat(formData.medicine_amount) || 0,
        payment_mode: formData.payment_mode,
        amount_received: parseFloat(formData.amount_received) || 0,
        planned_procedures: formData.planned_procedures,
        consultation_fee: cFee
      };
      // If consultation fee > 0, add it as a procedure line
      if (entryMode === 'STANDARD' && cFee > 0) {
        payload.consultation_procedure = { name: 'Consultation Fee', area: '', amount: cFee };
      }"""
)

# 9. In server payload for STANDARD, add consultation procedure to procedures array
code = code.replace(
    "      if (entryMode === 'STANDARD') {\n        payload.procedures = validProcs.map(p => ({ name: p.name, area: p.area, amount: parseFloat(p.amount) || 0 }));\n      }",
    """      if (entryMode === 'STANDARD') {
        const cFeeProc = payload.consultation_fee > 0
          ? [{ name: 'Consultation Fee', area: '', amount: payload.consultation_fee }]
          : [];
        payload.procedures = [...cFeeProc, ...validProcs.map(p => ({ name: p.name, area: p.area, amount: parseFloat(p.amount) || 0 }))];
        delete payload.consultation_procedure;
        delete payload.consultation_fee;
      }"""
)

# 10. Add Consultation Fee UI to the form - insert before Notes section
# Find the notes input area and add consultation fee section before it
consultation_ui = """
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Consultation Fee</Text>
            <View style={{backgroundColor: '#fff8e1', padding: 12, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#f59e0b'}}>
              <Text style={{color: '#92400e', fontSize: 13}}>Auto-calculated: {consultationNote}</Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={[styles.label, {flex: 1}]}>Consultation Fee (Rs.) — editable</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={formData.consultation_fee}
              onChangeText={(v) => handleInputChange('consultation_fee', v)}
              placeholder="0"
            />
            <Text style={{color:'#6b7280', fontSize: 12}}>Set to 0 if patient is opting for a procedure and consultation fee is to be adjusted in procedure cost.</Text>
          </View>
"""

# Insert before the Notes input section in the form
code = code.replace(
    "          <View style={styles.section}>\n            <Text style={styles.sectionTitle}>Notes</Text>",
    consultation_ui + "\n          <View style={styles.section}>\n            <Text style={styles.sectionTitle}>Notes</Text>"
)

# 11. Update the payment breakdown to show consultation fee
code = code.replace(
    "              <Text style={{fontSize: 14, color: '#444'}}>Procedure Total: Rs. {procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)}</Text>\n              <Text style={{fontSize: 14, color: '#444'}}>Medicine Total: Rs. {parseFloat(formData.medicine_amount) || 0}</Text>\n              <View style={{height: 1, backgroundColor: '#ddd', marginVertical: 8}}></View>\n              <Text style={{fontSize: 16, fontWeight: 'bold', color: '#000'}}>Grand Total (Visit + Meds): Rs. {procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)}</Text>",
    """              <Text style={{fontSize: 14, color: '#444'}}>Consultation Fee: Rs. {parseFloat(formData.consultation_fee) || 0}</Text>
              <Text style={{fontSize: 14, color: '#444'}}>Procedure Total: Rs. {procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)}</Text>
              <Text style={{fontSize: 14, color: '#444'}}>Medicine Total: Rs. {parseFloat(formData.medicine_amount) || 0}</Text>
              <View style={{height: 1, backgroundColor: '#ddd', marginVertical: 8}}></View>
              <Text style={{fontSize: 16, fontWeight: 'bold', color: '#000'}}>Grand Total: Rs. {(parseFloat(formData.consultation_fee) || 0) + procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)}</Text>"""
)

code = code.replace(
    "              <Text style={{fontSize: 14, color: '#ef4444', marginTop: 8}}>Already Paid in Pharmacy: - Rs. {todayPharmacyBilled}</Text>\n                  <Text style={{fontSize: 16, fontWeight: 'bold', color: '#10b981', marginTop: 5}}>Amount to Collect Now: Rs. {(procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)) - todayPharmacyBilled}</Text>",
    """              <Text style={{fontSize: 14, color: '#ef4444', marginTop: 8}}>Already Paid in Pharmacy: - Rs. {todayPharmacyBilled}</Text>
                  <Text style={{fontSize: 16, fontWeight: 'bold', color: '#10b981', marginTop: 5}}>Amount to Collect Now: Rs. {(parseFloat(formData.consultation_fee) || 0) + (procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)) - todayPharmacyBilled}</Text>"""
)

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Done!")
