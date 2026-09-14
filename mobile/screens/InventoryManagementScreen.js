import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, BackHandler } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTRUCTION_PRESETS = ['OD (Once Daily)', 'BD (Twice Daily)', 'TDS (Thrice Daily)', 'SOS (When Needed)', 'Apply at Night', 'Apply in Morning', 'Wash after 2 hrs', 'Wash after 30 min', 'Local application only', 'Use on alternate days', 'Weekly once'];

function InventoryManagementScreenContent({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [formData, setFormData] = useState({ id: null, medicine_name: '', batch_number: '', mrp: '', quantity: '', expiry_date: '', default_instructions: [], original_quantity: 0, is_new_batch: false });
  const [initialFormState, setInitialFormState] = useState(null);
  const [isRecModalVisible, setIsRecModalVisible] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recApplying, setRecApplying] = useState(false);
  const [recPreview, setRecPreview] = useState(null);

  const BASE_URL = 'https://skinssence-api.onrender.com/api/inventory';

  useEffect(() => {
    fetchInventory();
    AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      // Fetch all stock items (including 0 qty items)
      const response = await axios.get(`${BASE_URL}/all`, { headers: { Authorization: `Bearer ${token}` } });
      setInventory(response.data || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch inventory.');
    } finally {
      setLoading(false);
    }
  };

  const toggleInstruction = (preset) => {
    const current = formData.default_instructions;
    const updated = current.includes(preset)
      ? current.filter(i => i !== preset)
      : [...current, preset];
    setFormData({ ...formData, default_instructions: updated });
  };

  const handleSave = async () => {
    if (!formData.medicine_name || formData.quantity === '' || !formData.mrp) {
      return Alert.alert('Error', 'Please fill medicine name, quantity, and MRP.');
    }

    const newQty = parseInt(formData.quantity, 10) || 0;
    const isStaff = userRole !== 'ADMIN' && userRole !== 'DOCTOR';

    // Staff rule: Can add stock or edit details, but CANNOT reduce quantity
    if (formData.id && isStaff && newQty < (formData.original_quantity || 0)) {
      return Alert.alert(
        'Action Not Permitted',
        `Staff cannot reduce stock quantity below current level (${formData.original_quantity} units).\n\nYou can add more stock (e.g. ${formData.original_quantity}+ units) or update batch/price details.\n\nOnly Admin or Doctor can reduce stock.`
      );
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        medicine_name: formData.medicine_name.trim(),
        batch_number: formData.batch_number ? formData.batch_number.trim() : '',
        mrp: parseFloat(formData.mrp) || 0,
        quantity: newQty,
        expiry_date: formData.expiry_date ? formData.expiry_date.trim() : '',
        default_instructions: formData.default_instructions.join(', ')
      };

      if (formData.id) {
        await axios.put(`${BASE_URL}/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        Alert.alert('Success', 'Item updated in stock!');
      } else {
        await axios.post(BASE_URL, payload, { headers: { Authorization: `Bearer ${token}` } });
        Alert.alert('Success', 'New stock added successfully!');
      }
      setIsModalVisible(false);
      fetchInventory();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to save inventory item.');
    }
  };

  const handleDelete = async (id, name) => {
    Alert.alert('Delete Stock Item', `Are you sure you want to permanently delete "${name || 'this item'}" from stock?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Permanently', style: 'destructive', onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('userToken');
            await axios.delete(`${BASE_URL}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            Alert.alert('Deleted', 'Item removed permanently from stock & expiry list.');
            fetchInventory();
          } catch (error) {
            console.error(error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to delete item.');
          }
      }}
    ]);
  };

  const openReconciliationModal = async () => {
    setIsRecModalVisible(true);
    setRecLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/inventory/reconciliation/preview', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecPreview(res.data);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to generate reconciliation preview.');
      setIsRecModalVisible(false);
    } finally {
      setRecLoading(false);
    }
  };

  const handleApplyReconciliation = () => {
    Alert.alert(
      'Confirm Live Stock Reconciliation',
      `This will REPLACE and OVERRIDE current inventory balances with the Excel stock position (${recPreview?.summary?.total_stock_count || 0} total units).

No purchases, expenses, or financial entries will be created.

Do you want to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Replace',
          style: 'destructive',
          onPress: async () => {
            setRecApplying(true);
            try {
              const token = await AsyncStorage.getItem('userToken');
              const res = await axios.post(
                'https://skinssence-api.onrender.com/api/inventory/reconciliation/apply',
                {},
                { headers: { Authorization: `Bearer ${token}` } }
              );
              Alert.alert('Success', res.data.message || 'Stock successfully reconciled!');
              setIsRecModalVisible(false);
              fetchInventory();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.error || 'Failed to apply reconciliation.');
            } finally {
              setRecApplying(false);
            }
          }
        }
      ]
    );
  };

  const openAddModal = () => {
    const initial = { id: null, medicine_name: '', batch_number: '', mrp: '', quantity: '', expiry_date: '', default_instructions: [], is_new_batch: false, original_quantity: 0 };
    setFormData(initial);
    setInitialFormState(initial);
    setIsModalVisible(true);
  };

  const openAddBatchModal = (item) => {
    const instructions = item.default_instructions
      ? item.default_instructions.split(',').map(i => i.trim()).filter(Boolean)
      : [];
    const initial = {
      id: null, // creates a new stock entry
      medicine_name: item.medicine_name || '',
      batch_number: '',
      mrp: item.mrp ? item.mrp.toString() : '',
      quantity: '',
      expiry_date: '',
      default_instructions: instructions,
      is_new_batch: true,
      original_quantity: 0
    };
    setFormData(initial);
    setInitialFormState(initial);
    setIsModalVisible(true);
  };

  const openEditModal = (item) => {
    const instructions = item.default_instructions
      ? item.default_instructions.split(',').map(i => i.trim()).filter(Boolean)
      : [];
    const currQty = item.quantity !== undefined && item.quantity !== null ? item.quantity : 0;
    const initial = {
      id: item.id,
      medicine_name: item.medicine_name || '',
      batch_number: item.batch_number || '',
      mrp: item.mrp ? item.mrp.toString() : '',
      quantity: currQty.toString(),
      expiry_date: item.expiry_date || '',
      default_instructions: instructions,
      is_new_batch: false,
      original_quantity: currQty
    };
    setFormData(initial);
    setInitialFormState(initial);
    setIsModalVisible(true);
  };

  const hasUnsavedChanges = () => {
    if (!initialFormState) return false;
    const nameChanged = (formData.medicine_name || '').trim() !== (initialFormState.medicine_name || '').trim();
    const batchChanged = (formData.batch_number || '').trim() !== (initialFormState.batch_number || '').trim();
    const mrpChanged = (formData.mrp || '').toString().trim() !== (initialFormState.mrp || '').toString().trim();
    const qtyChanged = (formData.quantity || '').toString().trim() !== (initialFormState.quantity || '').toString().trim();
    const expChanged = (formData.expiry_date || '').trim() !== (initialFormState.expiry_date || '').trim();
    const currInst = Array.isArray(formData.default_instructions) ? [...formData.default_instructions].sort().join(',') : '';
    const initInst = Array.isArray(initialFormState.default_instructions) ? [...initialFormState.default_instructions].sort().join(',') : '';
    const instChanged = currInst !== initInst;

    return nameChanged || batchChanged || mrpChanged || qtyChanged || expChanged || instChanged;
  };

  const handleModalBackOrCancel = () => {
    if (hasUnsavedChanges()) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes in this medicine entry. Do you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard & Go Back',
            style: 'destructive',
            onPress: () => {
              setIsModalVisible(false);
              setInitialFormState(null);
            }
          }
        ]
      );
    } else {
      setIsModalVisible(false);
      setInitialFormState(null);
    }
  };

  useEffect(() => {
    const backAction = () => {
      if (isModalVisible) {
        handleModalBackOrCancel();
        return true;
      }
      if (isRecModalVisible) {
        setIsRecModalVisible(false);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isModalVisible, isRecModalVisible, formData, initialFormState]);

  const existingMedicineNames = Array.from(new Set(inventory.map(i => i.medicine_name).filter(Boolean)));

  const filteredInventory = inventory.filter(item => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase().trim();
    return (
      (item.medicine_name || '').toLowerCase().includes(q) ||
      (item.batch_number || '').toLowerCase().includes(q) ||
      (item.expiry_date || '').toLowerCase().includes(q)
    );
  });

  const isAdmin = userRole === 'ADMIN' || userRole === 'DOCTOR';

  let totalInStockMrpValue = 0;
  let totalInStockUnits = 0;
  let totalInStockBatches = 0;
  let filteredInStockMrpValue = 0;
  let filteredInStockUnits = 0;

  if (isAdmin) {
    inventory.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const mrp = Number(item.mrp) || 0;
      if (qty > 0) {
        totalInStockUnits += qty;
        totalInStockBatches += 1;
        totalInStockMrpValue += qty * mrp;
      }
    });

    filteredInventory.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const mrp = Number(item.mrp) || 0;
      if (qty > 0) {
        filteredInStockUnits += qty;
        filteredInStockMrpValue += qty * mrp;
      }
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Stock ({inventory.length})</Text>
        <View style={{flexDirection: 'row', gap: 6}}>
          {(userRole === 'ADMIN' || userRole === 'DOCTOR') && (
            <TouchableOpacity onPress={openReconciliationModal} style={[styles.addBtn, { backgroundColor: '#4338ca', paddingHorizontal: 10 }]}>
              <Text style={styles.addBtnText}>🔄 Reconcile</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openAddModal} style={styles.addBtn}><Text style={styles.addBtnText}>+ ADD</Text></TouchableOpacity>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
        <TextInput
          style={{ backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, fontSize: 13, borderWidth: 1, borderColor: '#e5e7eb' }}
          placeholder="🔍 Search medicine name, batch, or expiry..."
          value={searchQ}
          onChangeText={setSearchQ}
        />
      </View>

      {/* ADMIN ONLY: TOTAL IN-STOCK MRP VALUE CARD */}
      {isAdmin && (
        <View style={styles.adminValuationCard}>
          <View style={styles.valuationHeaderRow}>
            <View>
              <Text style={styles.valuationBadge}>👑 ADMIN ONLY</Text>
              <Text style={styles.valuationTitle}>Total In-Stock MRP Value</Text>
            </View>
            <Text style={styles.valuationAmount}>
              ₹{totalInStockMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.valuationStatsRow}>
            <View style={styles.valuationStatItem}>
              <Text style={styles.valuationStatLabel}>In-Stock Units</Text>
              <Text style={styles.valuationStatVal}>{totalInStockUnits.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.valuationStatDivider} />
            <View style={styles.valuationStatItem}>
              <Text style={styles.valuationStatLabel}>Active Batches</Text>
              <Text style={styles.valuationStatVal}>{totalInStockBatches}</Text>
            </View>
            <View style={styles.valuationStatDivider} />
            <View style={styles.valuationStatItem}>
              <Text style={styles.valuationStatLabel}>Distinct Meds</Text>
              <Text style={styles.valuationStatVal}>{existingMedicineNames.length}</Text>
            </View>
          </View>
          {searchQ.trim().length > 0 && (
            <View style={styles.filteredNoticeRow}>
              <Text style={styles.filteredNoticeText}>
                🔍 Filtered In-Stock MRP: <Text style={{ fontWeight: 'bold', color: '#1e40af' }}>₹{filteredInStockMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text> ({filteredInStockUnits} units)
              </Text>
            </View>
          )}
        </View>
      )}

      {loading ? <ActivityIndicator size="large" color="#5C0B0B" style={{marginTop: 50}} /> : (
        <ScrollView style={styles.scrollContent}>
          {filteredInventory.map(item => (
            <View key={item.id} style={[styles.itemCard, item.quantity === 0 && { borderColor: '#fca5a5', borderWidth: 1.5, backgroundColor: '#fff5f5' }]}>
              <View style={styles.itemInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.itemName}>{item.medicine_name}</Text>
                  {item.quantity === 0 && (
                    <View style={styles.outOfStockBadge}><Text style={styles.outOfStockText}>OUT OF STOCK (0)</Text></View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={styles.itemDetail}>Batch: <Text style={{fontWeight:'bold', color: '#1e40af'}}>{item.batch_number || 'N/A'}</Text></Text>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#9ca3af' }} />
                  <Text style={styles.itemDetail}>Expiry: <Text style={{fontWeight:'bold', color: '#b91c1c'}}>{item.expiry_date || 'N/A'}</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <Text style={styles.itemDetail}>Stock: <Text style={{fontWeight:'bold', color: item.quantity > 5 ? '#10b981' : (item.quantity === 0 ? '#b91c1c' : '#f59e0b')}}>{item.quantity} units</Text></Text>
                  <Text style={styles.itemDetail}>MRP: <Text style={{fontWeight: 'bold', color: '#111827'}}>₹{item.mrp}</Text></Text>
                </View>
                {item.default_instructions ? (
                  <View style={styles.instrBadgeRow}>
                    {item.default_instructions.split(',').map((i, idx) => (
                      <View key={idx} style={styles.instrBadge}><Text style={styles.instrBadgeText}>{i.trim()}</Text></View>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#10b981', marginBottom: 6}]} onPress={() => openAddBatchModal(item)}>
                  <Text style={styles.actionBtnText}>+ Batch</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]} onPress={() => openEditModal(item)}>
                  <Text style={styles.actionBtnText}>Edit</Text>
                </TouchableOpacity>
                {(userRole === 'ADMIN' || userRole === 'DOCTOR') && (
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ef4444', marginTop: 6}]} onPress={() => handleDelete(item.id, item.medicine_name)}>
                    <Text style={styles.actionBtnText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          {filteredInventory.length === 0 && <Text style={{textAlign: 'center', marginTop: 50, color: '#6b7280', fontSize: 16}}>No matching stock found.</Text>}
        </ScrollView>
      )}

      <Modal 
        visible={isModalVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={handleModalBackOrCancel}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <TouchableOpacity onPress={handleModalBackOrCancel} style={styles.modalTopBackBtn}>
                  <Text style={styles.modalTopBackText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  {formData.is_new_batch 
                    ? '📦 Add New Batch' 
                    : (formData.id ? 'Edit Stock Item' : 'Add Medicine')}
                </Text>
                <TouchableOpacity onPress={handleModalBackOrCancel} style={styles.modalTopCloseBtn}>
                  <Text style={styles.modalTopCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {formData.is_new_batch && (
                <View style={styles.newBatchBanner}>
                  <Text style={styles.newBatchBannerText}>
                    Adding new batch for: <Text style={{fontWeight: 'bold', color: '#166534'}}>{formData.medicine_name}</Text>
                  </Text>
                  <Text style={{fontSize: 11, color: '#15803d', marginTop: 2}}>
                    Composition & pack instructions will remain identical. Specify the new batch number, new expiry, MRP, and quantity below.
                  </Text>
                </View>
              )}

              {/* Quick-pick existing medicine when adding new */}
              {!formData.id && !formData.is_new_batch && existingMedicineNames.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#4b5563', marginBottom: 4 }}>
                    Or pick existing medicine to create batch:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    {existingMedicineNames.slice(0, 8).map(mName => (
                      <TouchableOpacity
                        key={mName}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f0fdf4', borderRadius: 12, marginRight: 6, borderWidth: 1, borderColor: '#86efac' }}
                        onPress={() => {
                          const match = inventory.find(i => i.medicine_name === mName);
                          if (match) openAddBatchModal(match);
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#166534', fontWeight: '500' }}>+ {mName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>Medicine Name *</Text>
              <TextInput 
                style={[styles.input, formData.is_new_batch && { backgroundColor: '#f1f5f9', color: '#475569' }]} 
                placeholder="Medicine Name *" 
                value={formData.medicine_name} 
                editable={!formData.is_new_batch}
                onChangeText={(v) => setFormData({...formData, medicine_name: v})} 
              />

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>Batch Number *</Text>
              <TextInput 
                style={styles.input} 
                placeholder="e.g. B204, LOT-89..." 
                value={formData.batch_number} 
                onChangeText={(v) => setFormData({...formData, batch_number: v})} 
              />

              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={{flex: 1}}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                    Quantity (units) * {formData.id && (userRole !== 'ADMIN' && userRole !== 'DOCTOR') ? `(Min: ${formData.original_quantity})` : ''}
                  </Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="Quantity *" 
                    keyboardType="numeric" 
                    value={formData.quantity} 
                    onChangeText={(v) => setFormData({...formData, quantity: v})} 
                  />
                  {formData.id && (userRole !== 'ADMIN' && userRole !== 'DOCTOR') && (
                    <Text style={{ fontSize: 11, color: '#dc2626', marginTop: -6, marginBottom: 6, fontWeight: '500' }}>
                      🔒 Cannot reduce below {formData.original_quantity} units.
                    </Text>
                  )}
                  {formData.id && (
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                      {[5, 10, 20, 50].map(addN => (
                        <TouchableOpacity
                          key={addN}
                          style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }}
                          onPress={() => {
                            const curr = parseInt(formData.quantity, 10) || formData.original_quantity || 0;
                            setFormData({ ...formData, quantity: (curr + addN).toString() });
                          }}
                        >
                          <Text style={{ fontSize: 11, color: '#166534', fontWeight: 'bold' }}>+{addN}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{flex: 1}}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>MRP per unit (₹) *</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="MRP (₹) *" 
                    keyboardType="numeric" 
                    value={formData.mrp} 
                    onChangeText={(v) => setFormData({...formData, mrp: v})} 
                  />
                </View>
              </View>

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>Expiry Date (MM/YYYY or MM/YY)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Expiry Date (e.g. 10/2026 or 10/26)" 
                value={formData.expiry_date} 
                onChangeText={(v) => setFormData({...formData, expiry_date: v})} 
              />

              <Text style={styles.instrLabel}>Default Usage Instructions</Text>
              <Text style={{color: '#666', fontSize: 12, marginBottom: 8}}>These will auto-appear when this medicine is selected on bills</Text>
              <View style={styles.presetGrid}>
                {INSTRUCTION_PRESETS.map(preset => {
                  const selected = formData.default_instructions.includes(preset);
                  return (
                    <TouchableOpacity key={preset} style={[styles.presetChip, selected && styles.presetChipSelected]} onPress={() => toggleInstruction(preset)}>
                      <Text style={[styles.presetChipText, selected && styles.presetChipTextSelected]}>{preset}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {formData.default_instructions.length > 0 && (
                <View style={styles.selectedInstr}>
                  <Text style={{fontSize: 13, color: '#2e7d32', fontWeight: 'bold'}}>Selected: {formData.default_instructions.join(' | ')}</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#6b7280'}]} onPress={handleModalBackOrCancel}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#5C0B0B'}]} onPress={handleSave}>
                  <Text style={styles.modalBtnText}>
                    {formData.is_new_batch ? 'Save Batch' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
      {/* LIVE STOCK RECONCILIATION MODAL */}
      <Modal 
        visible={isRecModalVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setIsRecModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', width: '95%' }]}>
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={() => setIsRecModalVisible(false)} style={styles.modalTopBackBtn}>
                <Text style={styles.modalTopBackText}>← Back</Text>
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: '#4338ca' }]} numberOfLines={1}>
                🔄 Live Reconciliation
              </Text>
              <TouchableOpacity onPress={() => setIsRecModalVisible(false)} style={styles.modalTopCloseBtn}>
                <Text style={styles.modalTopCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Replaces/overrides live stock quantities from the Excel summary file.
            </Text>

            {recLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4338ca" />
                <Text style={{ marginTop: 12, color: '#555' }}>Generating reconciliation preview from Excel...</Text>
              </View>
            ) : recPreview ? (
              <ScrollView style={{ flexGrow: 0, maxHeight: 420 }}>
                {/* Summary Banner */}
                <View style={{ backgroundColor: '#eef2ff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#c7d2fe', marginBottom: 12 }}>
                  <Text style={{ fontWeight: 'bold', color: '#3730a3', fontSize: 14, marginBottom: 4 }}>
                    Source: {recPreview.file_name}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                    <Text style={{ fontSize: 12, color: '#1e1b4b' }}>📦 Total Articles: <Text style={{fontWeight:'bold'}}>{recPreview.summary?.total_items_in_file}</Text></Text>
                    <Text style={{ fontSize: 12, color: '#15803d' }}>✨ Replace/Override: <Text style={{fontWeight:'bold'}}>{recPreview.summary?.items_replaced}</Text></Text>
                    <Text style={{ fontSize: 12, color: '#0369a1' }}>➕ New Added: <Text style={{fontWeight:'bold'}}>{recPreview.summary?.items_added}</Text></Text>
                    <Text style={{ fontSize: 12, color: '#b91c1c' }}>⏹️ Set to 0: <Text style={{fontWeight:'bold'}}>{recPreview.summary?.items_zeroed}</Text></Text>
                    <Text style={{ fontSize: 12, color: '#4b5563' }}>⏸️ Unchanged: <Text style={{fontWeight:'bold'}}>{recPreview.summary?.items_unchanged}</Text></Text>
                    <Text style={{ fontSize: 13, color: '#4338ca', fontWeight: 'bold' }}>🏁 Final Total Stock: {recPreview.summary?.total_stock_count} units</Text>
                  </View>
                </View>

                {/* Comparison Table Header */}
                <Text style={{ fontWeight: 'bold', color: '#374151', fontSize: 13, marginBottom: 6 }}>
                  Comparison / Action Preview (Top 50):
                </Text>

                <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
                    <Text style={{ flex: 2, fontWeight: 'bold', fontSize: 11, color: '#374151' }}>Medicine / Batch</Text>
                    <Text style={{ width: 45, fontWeight: 'bold', fontSize: 11, color: '#374151', textAlign: 'center' }}>App</Text>
                    <Text style={{ width: 45, fontWeight: 'bold', fontSize: 11, color: '#374151', textAlign: 'center' }}>Excel</Text>
                    <Text style={{ width: 45, fontWeight: 'bold', fontSize: 11, color: '#374151', textAlign: 'center' }}>Final</Text>
                    <Text style={{ width: 60, fontWeight: 'bold', fontSize: 11, color: '#374151', textAlign: 'center' }}>Action</Text>
                  </View>

                  {(recPreview.comparison || []).slice(0, 50).map((row, idx) => {
                    const isReplace = row.action === 'Replace';
                    const isAdd = row.action === 'Add';
                    const isZero = row.action.startsWith('Set to 0');
                    return (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <View style={{ flex: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1f2937' }} numberOfLines={1}>{row.medicine}</Text>
                          <Text style={{ fontSize: 10, color: '#6b7280' }}>Batch: {row.batch}</Text>
                        </View>
                        <Text style={{ width: 45, fontSize: 11, color: '#6b7280', textAlign: 'center', alignSelf: 'center' }}>{row.existing_stock}</Text>
                        <Text style={{ width: 45, fontSize: 11, fontWeight: 'bold', color: '#1e40af', textAlign: 'center', alignSelf: 'center' }}>{row.excel_balance}</Text>
                        <Text style={{ width: 45, fontSize: 11, fontWeight: 'bold', color: '#15803d', textAlign: 'center', alignSelf: 'center' }}>{row.final_stock}</Text>
                        <View style={{ width: 60, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            borderRadius: 4,
                            backgroundColor: isReplace ? '#fef3c7' : (isAdd ? '#e0f2fe' : (isZero ? '#fee2e2' : '#f3f4f6')),
                            color: isReplace ? '#b45309' : (isAdd ? '#0369a1' : (isZero ? '#b91c1c' : '#4b5563'))
                          }}>
                            {row.action}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : null}

            <View style={[styles.modalActions, { marginTop: 15 }]}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#6b7280' }]}
                onPress={() => setIsRecModalVisible(false)}
                disabled={recApplying}>
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4338ca', flex: 1.5 }]}
                onPress={handleApplyReconciliation}
                disabled={recLoading || recApplying}>
                {recApplying ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Confirm & Override Stock</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

class MedicineErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('Medicine module error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to load Medicine module</Text>
          <Text style={styles.errorMessage}>{this.state.error?.message || 'An unexpected error occurred.'}</Text>
          <TouchableOpacity 
            style={styles.retryBtn} 
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryBtnText}>🔄 Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.goBackBtn} 
            onPress={() => this.props.navigation?.goBack()}
          >
            <Text style={styles.goBackBtnText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function InventoryManagementScreen(props) {
  return (
    <MedicineErrorBoundary navigation={props.navigation}>
      <InventoryManagementScreenContent {...props} />
    </MedicineErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { padding: 5 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  addBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addBtnText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 13 },
  scrollContent: { padding: 15 },
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 12, elevation: 2, alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  outOfStockBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  outOfStockText: { color: '#b91c1c', fontSize: 10, fontWeight: 'bold' },
  itemDetail: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  instrBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  instrBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#86efac' },
  instrBadgeText: { fontSize: 10, color: '#166534' },
  itemActions: { marginLeft: 10, alignItems: 'center' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, minWidth: 60, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginTop: 40 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 14 },
  instrLabel: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginTop: 10, marginBottom: 4 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  presetChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  presetChipSelected: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  presetChipText: { fontSize: 11, color: '#374151' },
  presetChipTextSelected: { color: '#fff', fontWeight: 'bold' },
  selectedInstr: { backgroundColor: '#e8f5e9', padding: 8, borderRadius: 6, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 15 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  newBatchBanner: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 12 },
  newBatchBannerText: { fontSize: 13, color: '#166534', fontWeight: '600' },
  adminValuationCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4
  },
  valuationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  valuationBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 3
  },
  valuationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563'
  },
  valuationAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#065f46'
  },
  valuationStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6
  },
  valuationStatItem: {
    alignItems: 'center',
    flex: 1
  },
  valuationStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e2e8f0'
  },
  valuationStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2
  },
  valuationStatVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  filteredNoticeRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  filteredNoticeText: {
    fontSize: 12,
    color: '#475569'
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  modalTopBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 6
  },
  modalTopBackText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#374151'
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5C0B0B',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8
  },
  modalTopCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 6
  },
  modalTopCloseText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#b91c1c'
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center'
  },
  errorMessage: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 24
  },
  retryBtn: {
    backgroundColor: '#5C0B0B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold'
  },
  goBackBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  goBackBtnText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '600'
  }
});