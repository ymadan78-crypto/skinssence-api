const fs = require('fs');
const path = require('path');

const filePath = path.resolve('mobile/components/EditBillModal.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update loadBillDetails mapping of medicines to include unitPrice
const oldLoadMeds = `// Load medicines
      const loadedMeds = (data.medicines || []).map((m, idx) => {
        const parsed = parseMedicineDetailsString(m.details);
        return {
          id: m.id || \`med_\${idx}_\${Date.now()}\`,
          name: parsed.name,
          qty: String(parsed.qty || 1),
          amount: String(m.amount !== undefined && m.amount !== null ? m.amount : 0),
          batch: parsed.batch || ''
        };
      });
      setMedicines(loadedMeds);`;

const newLoadMeds = `// Load medicines with unit price calculation
      const loadedMeds = (data.medicines || []).map((m, idx) => {
        const parsed = parseMedicineDetailsString(m.details);
        const qtyNum = parseInt(parsed.qty, 10) || 1;
        const amtNum = parseFloat(m.amount) || 0;
        const unitP = qtyNum > 0 ? Math.round(amtNum / qtyNum) : amtNum;
        return {
          id: m.id || \`med_\${idx}_\${Date.now()}\`,
          name: parsed.name,
          qty: String(qtyNum),
          unitPrice: String(unitP),
          amount: String(amtNum),
          batch: parsed.batch || ''
        };
      });
      setMedicines(loadedMeds);`;

if (content.includes(oldLoadMeds)) {
  content = content.replace(oldLoadMeds, newLoadMeds);
}

// 2. Update initialVisit mapping of medicines
const oldInitMeds = `if (Array.isArray(v.medicines) && v.medicines.length > 0) {
        setMedicines(v.medicines.map((m, idx) => {
          const parsed = parseMedicineDetailsString(m.details || m.name);
          return {
            id: m.id || \`init_med_\${idx}_\${Date.now()}\`,
            name: parsed.name,
            qty: String(parsed.qty || 1),
            amount: String(m.amount !== undefined && m.amount !== null ? m.amount : 0),
            batch: parsed.batch || ''
          };
        }));
      }`;

const newInitMeds = `if (Array.isArray(v.medicines) && v.medicines.length > 0) {
        setMedicines(v.medicines.map((m, idx) => {
          const parsed = parseMedicineDetailsString(m.details || m.name);
          const qtyNum = parseInt(parsed.qty, 10) || 1;
          const amtNum = parseFloat(m.amount) || 0;
          const unitP = qtyNum > 0 ? Math.round(amtNum / qtyNum) : amtNum;
          return {
            id: m.id || \`init_med_\${idx}_\${Date.now()}\`,
            name: parsed.name,
            qty: String(qtyNum),
            unitPrice: String(unitP),
            amount: String(amtNum),
            batch: parsed.batch || ''
          };
        }));
      }`;

if (content.includes(oldInitMeds)) {
  content = content.replace(oldInitMeds, newInitMeds);
}

// 3. Update handleAddMedicine to set unitPrice and recalculate amount
const oldAddMed = `const handleAddMedicine = (medItem) => {
    setMedicines(prev => [
      ...prev,
      {
        id: \`temp_med_\${Date.now()}_\${Math.random()}\`,
        name: medItem.name,
        qty: String(medItem.qty || 1),
        amount: String(medItem.amount || 0),
        batch: medItem.batch || ''
      }
    ]);
    setShowMedPicker(false);
    setCustomMedName('');
    setCustomMedQty('1');
    setCustomMedAmount('');
  };`;

const newAddMed = `const handleAddMedicine = (medItem) => {
    const q = parseInt(medItem.qty, 10) || 1;
    const unitP = parseFloat(medItem.unitPrice || medItem.mrp || medItem.amount) || 0;
    const totalA = Math.round(q * unitP);
    setMedicines(prev => [
      ...prev,
      {
        id: \`temp_med_\${Date.now()}_\${Math.random()}\`,
        name: medItem.name,
        qty: String(q),
        unitPrice: String(unitP),
        amount: String(totalA),
        batch: medItem.batch || ''
      }
    ]);
    setShowMedPicker(false);
    setCustomMedName('');
    setCustomMedQty('1');
    setCustomMedAmount('');
  };`;

if (content.includes(oldAddMed)) {
  content = content.replace(oldAddMed, newAddMed);
}

// 4. Update the JSX for Section 3: Prescribed Medicines
const startSec3 = "{/* 3. PHARMACY MEDICINES (EDITABLE & EXPANDABLE) */}";
const endSec3 = "{/* 4. DISCOUNT */}";

const startIdx = content.indexOf(startSec3);
const endIdx = content.indexOf(endSec3);

if (startIdx !== -1 && endIdx !== -1) {
  const newSec3JSX = `{/* 3. PHARMACY MEDICINES (FULL TRUE EDIT: ADD, DELETE & MODIFY) */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.sectionTitle}>3. Prescribed Medicines</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{medicines.length} items</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionSubtitle}>
                      {canEdit ? 'Modify quantities, unit rates, delete or add new medicines' : 'Prescribed medicines in this visit'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.medsTotalBadge}>Meds Total: ₹{medsTotal.toLocaleString('en-IN')}</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.addMedBtn}
                        onPress={() => {
                          loadInventory();
                          setShowMedPicker(true);
                        }}
                      >
                        <Ionicons name="add-circle" size={16} color="#fff" style={{ marginRight: 4 }} />
                        <Text style={styles.addProcBtnText}>+ Add Medicine</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {medicines.length === 0 ? (
                  <View style={styles.emptyProcBox}>
                    <Ionicons name="medkit-outline" size={28} color="#94a3b8" />
                    <Text style={styles.emptyProcText}>No pharmacy medicines in this visit bill</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.emptyAddBtn}
                        onPress={() => {
                          loadInventory();
                          setShowMedPicker(true);
                        }}
                      >
                        <Ionicons name="add" size={16} color="#5C0B0B" style={{ marginRight: 4 }} />
                        <Text style={styles.emptyAddBtnText}>+ Add Medicine from Pharmacy Stock</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  medicines.map((med, mIdx) => {
                    const currentQty = parseInt(med.qty, 10) || 1;
                    const unitPriceVal = parseFloat(med.unitPrice) || (currentQty > 0 ? Math.round((parseFloat(med.amount) || 0) / currentQty) : 0);

                    return (
                      <View key={med.id || mIdx} style={styles.medCardContainer}>
                        {/* Header: Medicine Name & DELETE button */}
                        <View style={styles.medCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                            <Text style={styles.medCardIndex}>#{mIdx + 1}</Text>
                            <TextInput
                              style={[styles.medCardNameInput, !canEdit && styles.disabledInput]}
                              value={med.name}
                              onChangeText={(v) => handleMedicineChange(mIdx, 'name', v)}
                              editable={canEdit}
                              placeholder="Medicine Name"
                            />
                          </View>
                          {canEdit && (
                            <TouchableOpacity
                              onPress={() => {
                                Alert.alert(
                                  'Delete Medicine',
                                  \`Remove "\${med.name}" from this bill?\`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => handleRemoveMedicine(mIdx) }
                                  ]
                                );
                              }}
                              style={styles.medCardDeleteBtn}
                            >
                              <Ionicons name="trash" size={14} color="#dc2626" style={{ marginRight: 4 }} />
                              <Text style={styles.medCardDeleteText}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Controls: Quantity Stepper, Unit Rate, and Line Total */}
                        <View style={styles.medCardControlsRow}>
                          {/* Quantity Stepper */}
                          <View style={styles.medCardQtyCol}>
                            <Text style={styles.medControlLabel}>Quantity</Text>
                            <View style={styles.qtyStepperBox}>
                              <TouchableOpacity
                                style={styles.qtyStepBtn}
                                disabled={!canEdit || currentQty <= 1}
                                onPress={() => {
                                  const newQ = Math.max(1, currentQty - 1);
                                  handleMedicineChange(mIdx, 'qty', String(newQ));
                                  handleMedicineChange(mIdx, 'amount', String(Math.round(newQ * unitPriceVal)));
                                }}
                              >
                                <Text style={styles.qtyStepBtnText}>−</Text>
                              </TouchableOpacity>

                              <TextInput
                                style={[styles.qtyInputBox, !canEdit && styles.disabledInput]}
                                keyboardType="numeric"
                                value={String(med.qty)}
                                onChangeText={(val) => {
                                  const q = parseInt(val, 10) || 0;
                                  handleMedicineChange(mIdx, 'qty', val);
                                  if (q > 0) {
                                    handleMedicineChange(mIdx, 'amount', String(Math.round(q * unitPriceVal)));
                                  }
                                }}
                                editable={canEdit}
                              />

                              <TouchableOpacity
                                style={styles.qtyStepBtn}
                                disabled={!canEdit}
                                onPress={() => {
                                  const newQ = currentQty + 1;
                                  handleMedicineChange(mIdx, 'qty', String(newQ));
                                  handleMedicineChange(mIdx, 'amount', String(Math.round(newQ * unitPriceVal)));
                                }}
                              >
                                <Text style={styles.qtyStepBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Unit Rate */}
                          <View style={styles.medCardPriceCol}>
                            <Text style={styles.medControlLabel}>Rate (₹/unit)</Text>
                            <TextInput
                              style={[styles.rateInputBox, !canEdit && styles.disabledInput]}
                              keyboardType="numeric"
                              value={String(unitPriceVal)}
                              onChangeText={(val) => {
                                const uP = parseFloat(val) || 0;
                                handleMedicineChange(mIdx, 'unitPrice', val);
                                handleMedicineChange(mIdx, 'amount', String(Math.round(currentQty * uP)));
                              }}
                              editable={canEdit}
                              placeholder="0"
                            />
                          </View>

                          {/* Line Total */}
                          <View style={styles.medCardTotalCol}>
                            <Text style={styles.medControlLabel}>Line Total (₹)</Text>
                            <TextInput
                              style={[styles.lineTotalInputBox, !canEdit && styles.disabledInput]}
                              keyboardType="numeric"
                              value={String(med.amount)}
                              onChangeText={(val) => {
                                handleMedicineChange(mIdx, 'amount', val);
                                const tot = parseFloat(val) || 0;
                                if (currentQty > 0) {
                                  handleMedicineChange(mIdx, 'unitPrice', String(Math.round(tot / currentQty)));
                                }
                              }}
                              editable={canEdit}
                              placeholder="0"
                            />
                          </View>
                        </View>

                        {/* Footer: Batch info & Complimentary pill */}
                        <View style={styles.medCardFooterRow}>
                          {med.batch ? (
                            <Text style={styles.medBatchText}>Batch: {med.batch}</Text>
                          ) : <View />}

                          {canEdit && (
                            <TouchableOpacity
                              style={[styles.compPillBtn, parseFloat(med.amount) === 0 && styles.compPillBtnActive]}
                              onPress={() => {
                                if (parseFloat(med.amount) === 0) {
                                  const uP = parseFloat(med.unitPrice) || 100;
                                  handleMedicineChange(mIdx, 'amount', String(Math.round(currentQty * uP)));
                                } else {
                                  handleMedicineChange(mIdx, 'amount', '0');
                                }
                              }}
                            >
                              <Text style={[styles.compPillText, parseFloat(med.amount) === 0 && styles.compPillTextActive]}>
                                {parseFloat(med.amount) === 0 ? '🎁 Free / Complimentary (₹0)' : 'Make Complimentary (₹0)'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                {/* Additional Add Button at bottom of list if items exist */}
                {medicines.length > 0 && canEdit && (
                  <TouchableOpacity
                    style={styles.addMedBottomBtn}
                    onPress={() => {
                      loadInventory();
                      setShowMedPicker(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={styles.addMedBottomBtnText}>+ Add Another Medicine Item</Text>
                  </TouchableOpacity>
                )}
              </View>

              `;

  content = content.slice(0, startIdx) + newSec3JSX + content.slice(endIdx);
}

// 5. Add new styles for the interactive medicine card
const styleMarker = "styles = StyleSheet.create({";
const newMedStyles = `
  medCardContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  medCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  medCardIndex: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0284c7',
    marginRight: 6
  },
  medCardNameInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  medCardDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  medCardDeleteText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: 'bold'
  },
  medCardControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  medControlLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 3
  },
  medCardQtyCol: {
    flex: 1.2
  },
  qtyStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    overflow: 'hidden'
  },
  qtyStepBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyStepBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155'
  },
  qtyInputBox: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    paddingVertical: 4
  },
  medCardPriceCol: {
    flex: 1
  },
  rateInputBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right'
  },
  medCardTotalCol: {
    flex: 1.1
  },
  lineTotalInputBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#15803d',
    textAlign: 'right'
  },
  medCardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0'
  },
  medBatchText: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic'
  },
  compPillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  compPillBtnActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac'
  },
  compPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  compPillTextActive: {
    color: '#15803d',
    fontWeight: 'bold'
  },
  addMedBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderStyle: 'dashed',
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: '#f0f9ff'
  },
  addMedBottomBtnText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: 'bold'
  },
`;

if (!content.includes('medCardContainer:')) {
  content = content.replace(styleMarker, styleMarker + newMedStyles);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated EditBillModal.js with True Edit controls!');
