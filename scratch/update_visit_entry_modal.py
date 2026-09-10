with open('mobile/screens/VisitEntryScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update selectMasterProc
old_select = """  const selectMasterProc = (proc) => {
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

new_select = """  const selectMasterProc = (proc) => {
    const name = typeof proc === 'string' ? proc : proc.name;
    const procId = typeof proc === 'object' ? proc.id : null;
    const lastPrice = typeof proc === 'object' && proc.last_price ? proc.last_price.toString() : '';
    const newProcs = [...procedures];
    newProcs[activeProcIndex].procedure_id = procId;
    newProcs[activeProcIndex].name = name;
    // Suggest last used price as a flexible starting value if amount is currently empty
    if (!newProcs[activeProcIndex].amount && lastPrice && lastPrice !== '0') {
      newProcs[activeProcIndex].amount = lastPrice;
    }
    setProcedures(newProcs);
    setShowProcModal(false);
  };"""

if old_select in code:
    code = code.replace(old_select, new_select)
    print("Updated selectMasterProc!")

# 2. Update procedure payload mapping in handleSubmit
old_proc_map = """payload.procedures = validProcs.map(p => ({ name: p.name.trim(), area: p.area ? p.area.trim() : '', amount: parseFloat(p.amount) || 0 }));"""
new_proc_map = """payload.procedures = validProcs.map(p => ({ procedure_id: p.procedure_id || null, name: p.name.trim(), area: p.area ? p.area.trim() : '', amount: parseFloat(p.amount) || 0 }));"""

if old_proc_map in code:
    code = code.replace(old_proc_map, new_proc_map)
    print("Updated payload.procedures mapping in VisitEntryScreen!")

# 3. Update Procedure Modal UI to show Code & non-binding reference and remove unverified inline creation
old_modal_ui = """      {/* Procedure Modal */}
      <Modal visible={showProcModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Procedure</Text>
            {addingNewProc ? (
              <View style={{marginBottom: 20}}>
                <TextInput style={styles.input} placeholder="New Procedure Name..." value={newProcName} onChangeText={setNewProcName} />
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
                  <TouchableOpacity style={[styles.submitBtn, {flex: 1, backgroundColor: '#6b7280', marginRight: 5, padding: 10}]} onPress={() => setAddingNewProc(false)}><Text style={{color:'#fff', textAlign:'center'}}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, {flex: 1, marginLeft: 5, padding: 10}]} onPress={handleAddNewMasterProc}><Text style={{color:'#fff', textAlign:'center'}}>Save & Select</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={{backgroundColor: '#e0e7ff', padding: 12, borderRadius: 8, marginBottom: 15}} onPress={() => setAddingNewProc(true)}>
                <Text style={{color: '#4f46e5', fontWeight: 'bold', textAlign: 'center'}}>+ Add New Procedure Type</Text>
              </TouchableOpacity>
            )}
            
            <FlatList
              data={masterProcedures}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => selectMasterProc(item)}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={{fontSize: 16, color: '#333', fontWeight: '500'}}>{item.name}</Text>
                    {item.standard_price > 0 && (
                      <Text style={{fontSize: 14, color: '#059669', fontWeight: 'bold'}}>Rs. {item.standard_price}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#ef4444', marginTop: 15}]} onPress={() => setShowProcModal(false)}>
              <Text style={{color:'#fff', textAlign:'center', fontWeight: 'bold'}}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>"""

new_modal_ui = """      {/* Standardized Master Procedure Modal */}
      <Modal visible={showProcModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Select Master Procedure</Text>
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                Standardized procedure catalog. Price is flexible and entered on the next step.
              </Text>
            </View>
            
            <FlatList
              data={masterProcedures.filter(p => p.active !== 0)}
              keyExtractor={(item) => item.id.toString()}
              style={{ maxHeight: 380 }}
              renderItem={({item}) => (
                <TouchableOpacity style={[styles.modalItem, { paddingVertical: 10 }]} onPress={() => selectMasterProc(item)}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#5C0B0B', backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginRight: 6 }}>
                          {item.code || `P${item.id}`}
                        </Text>
                        <Text style={{fontSize: 15, color: '#1e293b', fontWeight: '600'}}>{item.name}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.category || 'General'}</Text>
                    </View>
                    {item.last_price > 0 ? (
                      <Text style={{fontSize: 12, color: '#047857', fontWeight: '500'}}>
                        Last: ₹{item.last_price}
                      </Text>
                    ) : item.avg_price > 0 ? (
                      <Text style={{fontSize: 12, color: '#2563eb', fontWeight: '500'}}>
                        Avg: ₹{item.avg_price}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#64748b', marginTop: 15}]} onPress={() => setShowProcModal(false)}>
              <Text style={{color:'#fff', textAlign:'center', fontWeight: 'bold'}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>"""

if old_modal_ui in code:
    code = code.replace(old_modal_ui, new_modal_ui)
    print("Updated procedure selection modal UI in VisitEntryScreen!")

with open('mobile/screens/VisitEntryScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("VisitEntryScreen.js saved successfully!")
