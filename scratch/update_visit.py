import re

with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add state for pharmacy billing
code = code.replace(
    "const [loading, setLoading] = useState(false);", 
    "const [loading, setLoading] = useState(false);\n  const [todayPharmacyBilled, setTodayPharmacyBilled] = useState(0);\n  const [fetchingPharmacy, setFetchingPharmacy] = useState(false);"
)

# 2. Add fetch logic inside useEffect
code = code.replace(
    "fetchMasterProcedures();",
    "fetchMasterProcedures();\n    fetchTodayPharmacy();"
)

fetch_pharm_func = """
  const fetchTodayPharmacy = async () => {
    setFetchingPharmacy(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}/patients/${patient.id}/visits`, { headers: { Authorization: `Bearer ${token}` } });
      const todayStr = new Date().toISOString().split('T')[0];
      
      let pharmacyTotal = 0;
      res.data.forEach(v => {
        const vDate = (v.created_at || '').split('T')[0];
        if (vDate === todayStr && v.planned_procedures === 'PHARMACY SALE') {
          if (v.payments) {
            v.payments.forEach(p => pharmacyTotal += (p.amount_received || 0));
          }
        }
      });
      
      setTodayPharmacyBilled(pharmacyTotal);
      if (pharmacyTotal > 0) {
        setFormData(prev => ({ ...prev, medicine_amount: pharmacyTotal.toString() }));
      }
    } catch (e) {
      console.log('Error fetching pharmacy', e);
    } finally {
      setFetchingPharmacy(false);
    }
  };
"""
code = code.replace("const fetchMasterProcedures = async () => {", fetch_pharm_func + "\n  const fetchMasterProcedures = async () => {")

# 3. Update the total logic so amount_received only includes NEW money.
# Wait, the user wants "Total Payment" displayed, and the server gets "Amount Received".
# We need to distinguish between "Total Billed" and "Amount to Collect Now"
code = code.replace(
    "setFormData(prev => ({ ...prev, amount_received: (procTotal + mAmt).toString() }));",
    "// We don't auto-set amount_received anymore to prevent double counting. We will calculate it in UI."
)

# 4. In handleSubmit, we send amount_received from state, which the user sees as "Amount to Collect Now"
# Let's change the UI to show these calculations.
ui_old = """
          <View style={styles.formGroup}>
            <Text style={styles.label}>Medicine Amount (Rs.)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={formData.medicine_amount} onChangeText={(val) => handleInputChange('medicine_amount', val)} />
          </View>
        </View>

        {entryMode === 'STANDARD' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            <View style={{flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15}}>
              {['CASH', 'UPI', 'CARD'].map(mode => (
                <TouchableOpacity key={mode} style={[styles.payBtn, formData.payment_mode === mode && styles.payBtnActive]} onPress={() => handleInputChange('payment_mode', mode)}>
                  <Text style={formData.payment_mode === mode ? {color:'#fff'} : {color:'#000'}}>{mode}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Amount Received (Rs.) - Auto Calculated</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={formData.amount_received} onChangeText={(val) => handleInputChange('amount_received', val)} />
          </View>
        )}
"""

# Find exact block to replace (using regex since exact string might differ)
import re
ui_pattern = re.compile(r'<View style=\{styles\.formGroup\}>\s*<Text style=\{styles\.label\}>Medicine Amount \(Rs\.\)</Text>.*?</View>\s*\)\}', re.DOTALL)

ui_new = """
          <View style={styles.formGroup}>
            <Text style={styles.label}>Medicine Amount (Rs.)</Text>
            {fetchingPharmacy ? <Text style={{color:'#666'}}>Fetching today's pharmacy bills...</Text> : null}
            <TextInput 
              style={[styles.input, todayPharmacyBilled > 0 && {backgroundColor: '#e8f5e9', borderColor: '#4caf50'}]} 
              keyboardType="numeric" 
              value={formData.medicine_amount} 
              editable={todayPharmacyBilled === 0}
              onChangeText={(val) => handleInputChange('medicine_amount', val)} 
            />
            {todayPharmacyBilled > 0 && <Text style={{color: '#2e7d32', fontSize: 12, marginTop: 5}}>Autofilled from today's Pharmacy Bill. (Read-only to prevent double billing)</Text>}
          </View>
        </View>

        {entryMode === 'STANDARD' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            
            <View style={{backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginBottom: 15}}>
              <Text style={{fontSize: 14, color: '#444'}}>Procedure Total: Rs. {procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)}</Text>
              <Text style={{fontSize: 14, color: '#444'}}>Medicine Total: Rs. {parseFloat(formData.medicine_amount) || 0}</Text>
              <View style={{height: 1, backgroundColor: '#ddd', marginVertical: 8}}></View>
              <Text style={{fontSize: 16, fontWeight: 'bold', color: '#000'}}>Grand Total (Visit + Meds): Rs. {procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)}</Text>
              
              {todayPharmacyBilled > 0 && (
                <>
                  <Text style={{fontSize: 14, color: '#ef4444', marginTop: 8}}>Already Paid in Pharmacy: - Rs. {todayPharmacyBilled}</Text>
                  <Text style={{fontSize: 16, fontWeight: 'bold', color: '#10b981', marginTop: 5}}>Amount to Collect Now: Rs. {(procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)) - todayPharmacyBilled}</Text>
                </>
              )}
            </View>

            <View style={{flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15}}>
              {['CASH', 'UPI', 'CARD'].map(mode => (
                <TouchableOpacity key={mode} style={[styles.payBtn, formData.payment_mode === mode && styles.payBtnActive]} onPress={() => handleInputChange('payment_mode', mode)}>
                  <Text style={formData.payment_mode === mode ? {color:'#fff'} : {color:'#000'}}>{mode}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Amount to Record in System (Rs.)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={formData.amount_received} onChangeText={(val) => handleInputChange('amount_received', val)} placeholder={`e.g. ${(procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + (parseFloat(formData.medicine_amount) || 0)) - todayPharmacyBilled}`} />
          </View>
        )}
"""

code = ui_pattern.sub(ui_new.strip(), code)

# Fix amount_received pre-population issue (we commented it out in useEffect earlier, let's fix it properly)
# I'll just remove the useEffect that auto-calculates amount_received so it's not buggy, and auto-calculate it correctly.
code = code.replace(
    "// We don't auto-set amount_received anymore to prevent double counting. We will calculate it in UI.",
    "const procTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);\n      const mAmt = parseFloat(formData.medicine_amount) || 0;\n      const collectNow = procTotal + mAmt - todayPharmacyBilled;\n      setFormData(prev => ({ ...prev, amount_received: Math.max(0, collectNow).toString() }));"
)

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)
