const fs = require('fs');
const path = require('path');

const filePath = path.resolve('mobile/components/PharmacyCorrectionModal.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states for editing and adding items
const stateMarker = "const [customCFee, setCustomCFee] = useState('');";
const stateAdditions = `const [customCFee, setCustomCFee] = useState('');

  // Item modification states
  const [editingItem, setEditingItem] = useState(null); // { id, name, qty, amount, unitPrice }
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [inventoryList, setInventoryList] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const [customMedName, setCustomMedName] = useState('');
  const [customMedQty, setCustomMedQty] = useState('1');
  const [customMedAmount, setCustomMedAmount] = useState('');
`;

if (!content.includes('editingItem')) {
  content = content.replace(stateMarker, stateAdditions);
}

// 2. Add handlers for item modify and add
const funcMarker = "const handleUpdatePaymentMode = async () => {";
const newFuncs = `const loadInventory = async () => {
    if (inventoryList.length > 0) return;
    setInvLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const res = await axios.get(\`\${baseUrl}/api/inventory\`, {
        headers: { Authorization: \`Bearer \${token}\` }
      });
      setInventoryList(res.data || []);
    } catch (e) {
      console.log('Error loading inventory:', e.message);
    } finally {
      setInvLoading(false);
    }
  };

  const handleSaveItemEdit = async () => {
    if (!editingItem || actionInProgress) return;
    setActionInProgress(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const payload = {
        new_qty: parseInt(editingItem.qty, 10) || 1,
        new_amount: parseFloat(editingItem.amount) || 0,
        new_name: editingItem.name,
        restore_inventory: true,
        reason: 'Staff/Doctor adjusted medicine line item'
      };

      await axios.put(\`\${baseUrl}/api/admin/pharmacy/sales/\${visitId}/items/\${editingItem.id}\`, payload, {
        headers: { Authorization: \`Bearer \${token}\` }
      });

      Alert.alert('Success', 'Medicine item updated successfully!');
      setEditingItem(null);
      await loadSaleDetails();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to update item:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to update item');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleAddNewMedicine = async (medData) => {
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const payload = {
        medicine_name: medData.name,
        qty: parseInt(medData.qty, 10) || 1,
        amount: parseFloat(medData.amount) || 0,
        batch: medData.batch || '',
        deduct_inventory: true,
        reason: 'Staff/Doctor added medicine to sale'
      };

      await axios.post(\`\${baseUrl}/api/admin/pharmacy/sales/\${visitId}/items\`, payload, {
        headers: { Authorization: \`Bearer \${token}\` }
      });

      Alert.alert('Success', \`Added \${medData.name} to this sale!\`);
      setShowAddMedModal(false);
      setCustomMedName('');
      setCustomMedQty('1');
      setCustomMedAmount('');
      await loadSaleDetails();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to add medicine:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to add medicine');
    } finally {
      setActionInProgress(false);
    }
  };

  `;

if (!content.includes('handleSaveItemEdit')) {
  content = content.replace(funcMarker, newFuncs + funcMarker);
}

// 3. Update the JSX section for medicines in PharmacyCorrectionModal
const oldSecJSX = `<View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>1. Billed Medicine Items</Text>
                  <Text style={styles.sectionSub}>Tap Remove to delete an item and restock</Text>
                </View>`;

const newSecJSX = `<View style={styles.sectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>1. Billed Medicine Items</Text>
                    <Text style={styles.sectionSub}>Edit quantities, adjust amounts, delete, or add new medicines</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addMedHeaderBtn}
                    onPress={() => {
                      loadInventory();
                      setShowAddMedModal(true);
                    }}
                  >
                    <Ionicons name="add-circle" size={16} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.addMedHeaderBtnText}>+ Add Med</Text>
                  </TouchableOpacity>
                </View>`;

if (content.includes(oldSecJSX)) {
  content = content.replace(oldSecJSX, newSecJSX);
}

// 4. Update the item row in medicines.map
const oldItemRow = `<TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => confirmDeleteItem(item)}
                        disabled={actionInProgress}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
                        <Text style={styles.deleteBtnText}>Remove</Text>
                      </TouchableOpacity>`;

const newItemRow = `<View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.editItemBtn}
                          onPress={() => {
                            const q = parseInt(item.parsed_qty, 10) || 1;
                            const amt = parseFloat(item.amount) || 0;
                            setEditingItem({
                              id: item.id,
                              name: item.parsed_name || item.details,
                              qty: String(q),
                              unitPrice: String(q > 0 ? Math.round(amt / q) : amt),
                              amount: String(amt),
                              batch: item.parsed_batch || ''
                            });
                          }}
                          disabled={actionInProgress}
                        >
                          <Ionicons name="pencil" size={14} color="#0284c7" style={{ marginRight: 4 }} />
                          <Text style={styles.editItemBtnText}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => confirmDeleteItem(item)}
                          disabled={actionInProgress}
                        >
                          <Ionicons name="trash-outline" size={15} color="#ef4444" style={{ marginRight: 4 }} />
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>`;

if (content.includes(oldItemRow)) {
  content = content.replace(oldItemRow, newItemRow);
}

// 5. Add Modals for Edit Item and Add Medicine before the closing </Modal>
const modalCloseTag = "</Modal>";
const lastModalCloseIdx = content.lastIndexOf(modalCloseTag);

const extraModals = `{/* DIALOG: EDIT MEDICINE ITEM */}
      <Modal
        visible={!!editingItem}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingItem(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Edit Medicine Item</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {editingItem && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.dialogLabel}>Medicine Name</Text>
                <TextInput
                  style={styles.dialogInput}
                  value={editingItem.name}
                  onChangeText={(v) => setEditingItem({ ...editingItem, name: v })}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dialogLabel}>Quantity</Text>
                    <View style={styles.qtyStepperRow}>
                      <TouchableOpacity
                        style={styles.qtyStepperBtn}
                        onPress={() => {
                          const q = Math.max(1, (parseInt(editingItem.qty, 10) || 1) - 1);
                          const uP = parseFloat(editingItem.unitPrice) || 0;
                          setEditingItem({ ...editingItem, qty: String(q), amount: String(Math.round(q * uP)) });
                        }}
                      >
                        <Text style={styles.qtyStepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.qtyStepperInput}
                        keyboardType="numeric"
                        value={editingItem.qty}
                        onChangeText={(v) => {
                          const q = parseInt(v, 10) || 0;
                          const uP = parseFloat(editingItem.unitPrice) || 0;
                          setEditingItem({ ...editingItem, qty: v, amount: q > 0 ? String(Math.round(q * uP)) : editingItem.amount });
                        }}
                      />
                      <TouchableOpacity
                        style={styles.qtyStepperBtn}
                        onPress={() => {
                          const q = (parseInt(editingItem.qty, 10) || 1) + 1;
                          const uP = parseFloat(editingItem.unitPrice) || 0;
                          setEditingItem({ ...editingItem, qty: String(q), amount: String(Math.round(q * uP)) });
                        }}
                      >
                        <Text style={styles.qtyStepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.dialogLabel}>Rate (₹/unit)</Text>
                    <TextInput
                      style={styles.dialogInput}
                      keyboardType="numeric"
                      value={editingItem.unitPrice}
                      onChangeText={(v) => {
                        const uP = parseFloat(v) || 0;
                        const q = parseInt(editingItem.qty, 10) || 1;
                        setEditingItem({ ...editingItem, unitPrice: v, amount: String(Math.round(q * uP)) });
                      }}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.dialogLabel}>Line Total Amount (₹)</Text>
                  <TextInput
                    style={[styles.dialogInput, { fontWeight: 'bold', color: '#15803d', fontSize: 16 }]}
                    keyboardType="numeric"
                    value={editingItem.amount}
                    onChangeText={(v) => {
                      const tot = parseFloat(v) || 0;
                      const q = parseInt(editingItem.qty, 10) || 1;
                      setEditingItem({ ...editingItem, amount: v, unitPrice: q > 0 ? String(Math.round(tot / q)) : editingItem.unitPrice });
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={styles.dialogCancelBtn}
                    onPress={() => setEditingItem(null)}
                  >
                    <Text style={styles.dialogCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dialogSaveBtn}
                    onPress={handleSaveItemEdit}
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.dialogSaveText}>Save & Update Item</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: ADD MEDICINE TO PHARMACY SALE */}
      <Modal
        visible={showAddMedModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddMedModal(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogBox, { maxHeight: '85%' }]}>
            <View style={styles.dialogHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="medkit" size={18} color="#5C0B0B" />
                <Text style={styles.dialogTitle}>Add Medicine to Sale</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddMedModal(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {/* Custom Item Box */}
              <View style={styles.customMedBox}>
                <Text style={styles.customMedBoxTitle}>Custom Medicine Item</Text>
                <TextInput
                  style={styles.dialogInput}
                  placeholder="Medicine Name (e.g. Sebogel)"
                  value={customMedName}
                  onChangeText={setCustomMedName}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.dialogInput, { width: 80 }]}
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={customMedQty}
                    onChangeText={setCustomMedQty}
                  />
                  <TextInput
                    style={[styles.dialogInput, { flex: 1 }]}
                    placeholder="Total Price (₹)"
                    keyboardType="numeric"
                    value={customMedAmount}
                    onChangeText={setCustomMedAmount}
                  />
                </View>
                <TouchableOpacity
                  style={styles.addCustomBtn}
                  onPress={() => {
                    if (!customMedName.trim()) {
                      Alert.alert('Required', 'Please enter medicine name');
                      return;
                    }
                    handleAddNewMedicine({
                      name: customMedName.trim(),
                      qty: parseInt(customMedQty, 10) || 1,
                      amount: parseFloat(customMedAmount) || 0
                    });
                  }}
                  disabled={actionInProgress}
                >
                  <Text style={styles.addCustomBtnText}>+ Add Custom Item</Text>
                </TouchableOpacity>
              </View>

              {/* Inventory search */}
              <View style={{ marginTop: 12, marginBottom: 8 }}>
                <Text style={styles.dialogLabel}>Or Select from Pharmacy Stock:</Text>
                <View style={styles.searchBoxRow}>
                  <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 13 }}
                    placeholder="Search stock..."
                    value={medSearch}
                    onChangeText={setMedSearch}
                  />
                </View>
              </View>

              {invLoading ? (
                <ActivityIndicator size="small" color="#5C0B0B" style={{ marginVertical: 14 }} />
              ) : (
                (inventoryList || [])
                  .filter(item => {
                    if (!medSearch.trim()) return true;
                    return (item.medicine_name || '').toLowerCase().includes(medSearch.toLowerCase().trim());
                  })
                  .slice(0, 20)
                  .map((item, idx) => (
                    <TouchableOpacity
                      key={item.id || idx}
                      style={styles.invItemRow}
                      onPress={() => {
                        handleAddNewMedicine({
                          name: item.medicine_name,
                          qty: 1,
                          amount: item.mrp || 0,
                          batch: item.batch_number || ''
                        });
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invItemName}>{item.medicine_name}</Text>
                        <Text style={styles.invItemSub}>Stock: {item.quantity} {item.unit || 'units'} {item.batch_number ? \`• Batch: \${item.batch_number}\` : ''}</Text>
                      </View>
                      <Text style={styles.invItemPrice}>₹{item.mrp}</Text>
                      <Ionicons name="add-circle-outline" size={20} color="#5C0B0B" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
`;

if (lastModalCloseIdx !== -1 && !content.includes('editingItem')) {
  content = content.slice(0, lastModalCloseIdx) + extraModals + content.slice(lastModalCloseIdx);
}

// 6. Add styles for the new buttons and dialogs
const styleMarker = "styles = StyleSheet.create({";
const extraStyles = `
  addMedHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  addMedHeaderBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  editItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  editItemBtnText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: 'bold'
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 20
  },
  dialogBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 4
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  dialogLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4
  },
  dialogInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    overflow: 'hidden'
  },
  qtyStepperBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyStepperBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155'
  },
  qtyStepperInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    paddingVertical: 4
  },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  dialogCancelText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13
  },
  dialogSaveBtn: {
    flex: 1.5,
    backgroundColor: '#5C0B0B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dialogSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  customMedBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },
  customMedBoxTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6
  },
  addCustomBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8
  },
  addCustomBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  searchBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  invItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  invItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  invItemSub: {
    fontSize: 11,
    color: '#64748b'
  },
  invItemPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#5C0B0B',
    marginLeft: 6
  },
`;

if (!content.includes('addMedHeaderBtn:')) {
  content = content.replace(styleMarker, styleMarker + extraStyles);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully upgraded PharmacyCorrectionModal.js with Add & Modify!');
