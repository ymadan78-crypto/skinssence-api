with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update validation in handleSubmit
old_validation = """    if (entryMode === 'STANDARD' && !hasConsultation && !hasProcedures && !hasPharmacy) {
      Alert.alert('Incomplete Entry', 'Please enter a consultation fee, add a procedure, or sync a pharmacy bill.');
      return;
    }"""

new_validation = """    // Zero-billing visits (e.g. Report Review, Free Follow-up, Diagnostic check) are fully supported
    if (entryMode === 'STANDARD' && !hasConsultation && !hasProcedures && !hasPharmacy) {
      if (!formData.planned_procedures) {
        formData.planned_procedures = 'REPORT REVIEW / FOLLOW UP';
      }
    }"""

if old_validation in code:
    code = code.replace(old_validation, new_validation)
    print("Updated handleSubmit validation in VisitEntryScreen.js!")
else:
    print("Warning: old_validation not matched!")

# 2. Add Visit Purpose Quick Chips in UI
old_consultation_ui = """            <Text style={styles.label}>Consultation Fee (Rs.) — Editable</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={consultationFee}
              onChangeText={(v) => setConsultationFee(v)}
              placeholder="400"
            />
            <Text style={styles.helperText}>
              Set to 0 if patient is opting for a procedure and consultation fee is waived/deducted from procedure cost.
            </Text>"""

new_consultation_ui = """            <Text style={styles.label}>Visit Type / Consultation Fee</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, consultationFee === '400' ? { backgroundColor: '#fef3c7', borderColor: '#d97706' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('400'); setConsultationNote('Standard Consultation (₹400)'); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: consultationFee === '400' ? '#92400e' : '#4b5563' }}>🩺 Standard (₹400)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, (consultationFee === '0' && (formData.planned_procedures || '').includes('REPORT')) ? { backgroundColor: '#dcfce7', borderColor: '#16a34a' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('0'); setConsultationNote('Report Review / Follow-up (₹0)'); setFormData(p => ({ ...p, planned_procedures: 'REPORT REVIEW / FOLLOW UP' })); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#166534' }}>🔬 Report Review (₹0)</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, consultationFee === '0' ? { backgroundColor: '#f3f4f6', borderColor: '#9ca3af' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('0'); setConsultationNote('Fee Waived / Included (₹0)'); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#4b5563' }}>📋 Fee Waived (₹0)</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={consultationFee}
              onChangeText={(v) => setConsultationFee(v)}
              placeholder="0"
            />
            <Text style={styles.helperText}>
              Set to ₹0 for Report Reviews, free follow-ups, or when fee is waived.
            </Text>"""

if old_consultation_ui in code:
    code = code.replace(old_consultation_ui, new_consultation_ui)
    print("Added Quick Chips to Consultation UI in VisitEntryScreen.js!")
else:
    print("Warning: old_consultation_ui not matched!")

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("VisitEntryScreen.js saved successfully!")
