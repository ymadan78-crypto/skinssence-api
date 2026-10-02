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

  // --- ITEM DETAILS & STOCK HISTORY STATE ---
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [itemHistoryData, setItemHistoryData] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('ALL');

  // Dedicated Add Stock Modal
  const [isAddStockModalVisible, setIsAddStockModalVisible] = useState(false);
  const [addStockForm, setAddStockForm] = useState({ quantity: '', batch_number: '', expiry_date: '', reason: 'Supplier Delivery', notes: '' });
  const [addStockLoading, setAddStockLoading] = useState(false);

  // Dedicated Stock Adjustment Modal
  const [isAdjustModalVisible, setIsAdjustModalVisible] = useState(false);
  const [isClinicUseModalVisible, setIsClinicUseModalVisible] = useState(false);
  const [clinicUseSummary, setClinicUseSummary] = useState(null);
  const [clinicUseLoading, setClinicUseLoading] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ direction: 'REDUCE', quantity: '', reason_type: 'Damaged', notes: '' });
  const [adjustLoading, setAdjustLoading] = useState(false);

  const BASE_URL = 'https://skinssence-api.onrender.com/api/inventory';

  useEffect(() => {
    fetchInventory();
    AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ' ' + d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  const openItemHistoryModal = async (item, filter = 'ALL') => {
    setSelectedHistoryItem(item);
    setIsHistoryModalVisible(true);
    setHistoryLoading(true);
    setHistoryFilter(filter);

    // Populate instant local item data so user immediately sees stock status, unit, and controls
    setItemHistoryData({
      item: item,
      summary: {
        current_stock: parseFloat(item.quantity) || 0,
        unit: item.unit || 'units',
        reorder_level: item.reorder_level !== undefined && item.reorder_level !== null ? item.reorder_level : 5,
        total_added: parseFloat(item.quantity) || 0,
        total_sold: 0,
        total_reduced: 0,
        total_adjustments: 0,
        last_added: null,
        last_sold: null
      },
      movements: []
    });

    try {
      const token = await AsyncStorage.getItem('userToken');
      const url = `${BASE_URL}/${item.id}/history${filter !== 'ALL' ? `?type=${filter}` : ''}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data) {
        setItemHistoryData(res.data);
      }
    } catch (e) {
      console.log('Stock history API notice:', e?.response?.status || e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFilterChange = async (newFilter) => {
    if (!selectedHistoryItem) return;
    setHistoryFilter(newFilter);
    setHistoryLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const url = `${BASE_URL}/${selectedHistoryItem.id}/history${newFilter !== 'ALL' ? `?type=${newFilter}` : ''}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setItemHistoryData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openAddStockModal = () => {
    if (!selectedHistoryItem) return;
    setAddStockForm({
      quantity: '',
      batch_number: selectedHistoryItem.batch_number || '',
      expiry_date: selectedHistoryItem.expiry_date || '',
      reason: 'Supplier Delivery',
      notes: ''
    });
    setIsAddStockModalVisible(true);
  };

  const handleSaveAddStock = async () => {
    const qty = parseFloat(addStockForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      return Alert.alert('Invalid Quantity', 'Please enter a quantity greater than zero.');
    }
    setAddStockLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.post(
        `${BASE_URL}/${selectedHistoryItem.id}/add-stock`,
        {
          quantity: qty,
          batch_number: addStockForm.batch_number,
          expiry_date: addStockForm.expiry_date,
          reason: addStockForm.reason,
          notes: addStockForm.notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Stock Added', res.data.message || 'Stock successfully added!');
      setIsAddStockModalVisible(false);
      fetchInventory();
      openItemHistoryModal(res.data.item || selectedHistoryItem, historyFilter);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to add stock.');
    } finally {
      setAddStockLoading(false);
    }
  };

  const openAdjustModal = () => {
    if (!selectedHistoryItem) return;
    const isStaff = userRole !== 'ADMIN' && userRole !== 'DOCTOR';
    setAdjustForm({
      direction: 'REDUCE',
      quantity: isStaff ? '1' : '',
      unit_price: selectedHistoryItem.mrp ? String(selectedHistoryItem.mrp) : '0',
      reason_type: '🏥 Clinic Use',
      notes: ''
    });
    setIsAdjustModalVisible(true);
  };

  const openClinicUseSummaryModal = async () => {
    setIsClinicUseModalVisible(true);
    setClinicUseLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/inventory/clinic-use/summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClinicUseSummary(res.data);
    } catch (e) {
      console.error('Failed to load clinic use summary:', e);
      Alert.alert('Error', 'Unable to fetch clinic consumption statistics.');
    } finally {
      setClinicUseLoading(false);
    }
  };

  const handleSaveAdjust = async () => {
    const rawQty = parseFloat(adjustForm.quantity);
    if (isNaN(rawQty) || rawQty <= 0) {
      return Alert.alert('Invalid Quantity', 'Please enter a valid quantity.');
    }
    const signedQty = adjustForm.direction === 'REDUCE' ? -rawQty : rawQty;
    const isStaff = userRole !== 'ADMIN' && userRole !== 'DOCTOR';
    const isClinicUse = adjustForm.reason_type && adjustForm.reason_type.includes('Clinic');

    if (isStaff && signedQty < 0) {
      if (!isClinicUse) {
        return Alert.alert('Permission Denied', 'Staff cannot reduce stock quantity for this reason. Only Admin or Doctor can reduce stock.');
      }
      if (rawQty !== 1) {
        return Alert.alert('Quantity Limit', 'Staff is only allowed to deduct exactly 1 unit at a time for Clinic Use. For bulk quantities, please contact Doctor or Admin.');
      }
    }
    setAdjustLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.post(
        `${BASE_URL}/${selectedHistoryItem.id}/adjust`,
        {
          quantity: signedQty,
          reason_type: adjustForm.reason_type,
          unit_price: parseFloat(adjustForm.unit_price) || parseFloat(selectedHistoryItem.mrp) || 0,
          notes: adjustForm.notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Stock Adjusted', res.data.message || 'Stock adjusted successfully!');
      setIsAdjustModalVisible(false);
      fetchInventory();
      openItemHistoryModal(res.data.item || selectedHistoryItem, historyFilter);
    } catch (e) {
      Alert.alert('Adjustment Error', e.response?.data?.error || 'Failed to adjust stock.');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleQuickClinicUse = (item) => {
    if (!item) return;
    const currentQty = parseFloat(item.quantity) || 0;
    if (currentQty <= 0) {
      return Alert.alert('Out of Stock', `Cannot deduct "${item.medicine_name}". Current stock is 0.`);
    }

    Alert.alert(
      '🏥 Confirm Clinic Use',
      `Deduct 1 ${item.unit || 'unit'} of "${item.medicine_name}" (Batch: ${item.batch_number || 'N/A'}) for in-house Clinic Use?\n\nCurrent stock: ${currentQty}\nNew stock will be: ${currentQty - 1}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Deduct (-1)',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('userToken');
              const res = await axios.post(
                `${BASE_URL}/${item.id}/adjust`,
                {
                  quantity: -1,
                  reason_type: '🏥 Clinic Use',
                  unit_price: parseFloat(item.mrp) || 0,
                  notes: 'Quick clinic consumption logged by staff'
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              Alert.alert('✅ Stock Updated', `1 ${item.unit || 'unit'} of "${item.medicine_name}" deducted for Clinic Use!\n\nNew stock: ${res.data.newQuantity}`);
              fetchInventory();
            } catch (err) {
              console.error('Quick clinic use error:', err);
              Alert.alert('Adjustment Failed', err.response?.data?.error || err.message || 'Could not adjust stock.');
            }
          }
        }
      ]
    );
  };

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
      if (isAdjustModalVisible) {
        setIsAdjustModalVisible(false);
        return true;
      }
      if (isAddStockModalVisible) {
        setIsAddStockModalVisible(false);
        return true;
      }
      if (isHistoryModalVisible) {
        setIsHistoryModalVisible(false);
        return true;
      }
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
  }, [isModalVisible, isRecModalVisible, isHistoryModalVisible, isAddStockModalVisible, isAdjustModalVisible, formData, initialFormState]);

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
          <TouchableOpacity onPress={openClinicUseSummaryModal} style={[styles.addBtn, { backgroundColor: '#6d28d9', paddingHorizontal: 10 }]}>
            <Text style={styles.addBtnText}>🏥 Clinic Use</Text>
          </TouchableOpacity>
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
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              onPress={() => openItemHistoryModal(item)}
              style={[styles.itemCard, item.quantity === 0 && { borderColor: '#fca5a5', borderWidth: 1.5, backgroundColor: '#fff5f5' }]}
            >
              <View style={styles.itemInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.itemName}>{item.medicine_name}</Text>
                  {item.quantity === 0 ? (
                    <View style={styles.outOfStockBadge}><Text style={styles.outOfStockText}>OUT OF STOCK (0)</Text></View>
                  ) : (
                    <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#bfdbfe' }}>
                      <Text style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 'bold' }}>📋 History</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={styles.itemDetail}>Batch: <Text style={{fontWeight:'bold', color: '#1e40af'}}>{item.batch_number || 'N/A'}</Text></Text>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#9ca3af' }} />
                  <Text style={styles.itemDetail}>Expiry: <Text style={{fontWeight:'bold', color: '#b91c1c'}}>{item.expiry_date || 'N/A'}</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <Text style={styles.itemDetail}>Stock: <Text style={{fontWeight:'bold', color: item.quantity > 5 ? '#10b981' : (item.quantity === 0 ? '#b91c1c' : '#f59e0b')}}>{item.quantity} {item.unit || 'units'}</Text></Text>
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
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#7c3aed', marginBottom: 6}]} onPress={() => handleQuickClinicUse(item)}>
                  <Text style={styles.actionBtnText}>🏥 Use 1</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#4338ca', marginBottom: 6}]} onPress={() => openItemHistoryModal(item)}>
                  <Text style={styles.actionBtnText}>History</Text>
                </TouchableOpacity>
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
            </TouchableOpacity>
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

      {/* 1. ITEM DETAILS & STOCK HISTORY MODAL */}
      <Modal
        visible={isHistoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={{ height: '88%', width: '100%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginTop: 0 }}>
            {/* Modal Header */}
            <View style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity onPress={() => setIsHistoryModalVisible(false)} style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>← Back</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }} numberOfLines={1}>
                  {selectedHistoryItem?.medicine_name || 'Stock History'}
                </Text>
                <Text style={{ color: '#fca5a5', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                  Batch: {selectedHistoryItem?.batch_number || 'N/A'} | Exp: {selectedHistoryItem?.expiry_date || 'N/A'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsHistoryModalVisible(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={true}>
                {/* Top Metrics Grid */}
                <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Inventory Summary</Text>
                    <View style={{
                      backgroundColor: (itemHistoryData?.summary?.current_stock || 0) > (itemHistoryData?.summary?.reorder_level || 5) ? '#dcfce7' : ((itemHistoryData?.summary?.current_stock || 0) === 0 ? '#fee2e2' : '#fef3c7'),
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 10
                    }}>
                      <Text style={{
                        fontSize: 10,
                        fontWeight: 'bold',
                        color: (itemHistoryData?.summary?.current_stock || 0) > (itemHistoryData?.summary?.reorder_level || 5) ? '#166534' : ((itemHistoryData?.summary?.current_stock || 0) === 0 ? '#991b1b' : '#92400e')
                      }}>
                        {(itemHistoryData?.summary?.current_stock || 0) === 0 ? 'OUT OF STOCK' : ((itemHistoryData?.summary?.current_stock || 0) <= (itemHistoryData?.summary?.reorder_level || 5) ? 'LOW STOCK' : 'IN STOCK')}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1, backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>Current Stock</Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0f172a' }}>
                        {itemHistoryData?.summary?.current_stock ?? 0}{' '}
                        <Text style={{ fontSize: 12, fontWeight: 'normal', color: '#64748b' }}>{itemHistoryData?.summary?.unit || 'units'}</Text>
                      </Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>Reorder Level</Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#f59e0b' }}>
                        {itemHistoryData?.summary?.reorder_level ?? 5}{' '}
                        <Text style={{ fontSize: 12, fontWeight: 'normal', color: '#64748b' }}>{itemHistoryData?.summary?.unit || 'units'}</Text>
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' }}>
                      <Text style={{ fontSize: 10, color: '#166534', fontWeight: 'bold' }}>Total Added</Text>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#15803d' }}>+{itemHistoryData?.summary?.total_added ?? 0}</Text>
                      <Text style={{ fontSize: 9, color: '#15803d', marginTop: 2 }} numberOfLines={1}>Last: {formatDateTime(itemHistoryData?.summary?.last_added)}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#eff6ff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#bfdbfe' }}>
                      <Text style={{ fontSize: 10, color: '#1e40af', fontWeight: 'bold' }}>Total Sold</Text>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#2563eb' }}>-{itemHistoryData?.summary?.total_sold ?? 0}</Text>
                      <Text style={{ fontSize: 9, color: '#1e40af', marginTop: 2 }} numberOfLines={1}>Last: {formatDateTime(itemHistoryData?.summary?.last_sold)}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#fff1f2', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#fecdd3' }}>
                      <Text style={{ fontSize: 10, color: '#9f1239', fontWeight: 'bold' }}>Adjustments</Text>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#e11d48' }}>{itemHistoryData?.summary?.total_adjustments ?? 0}</Text>
                      <Text style={{ fontSize: 9, color: '#9f1239', marginTop: 2 }} numberOfLines={1}>Red: -{itemHistoryData?.summary?.total_reduced ?? 0}</Text>
                    </View>
                  </View>

                  {/* CLINIC USE CARD */}
                  <View style={{ backgroundColor: '#f5f3ff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#ddd6fe', marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#6d28d9', fontWeight: 'bold' }}>🏥 Clinic / In-House Use</Text>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#7c3aed' }}>
                        Total Value: ₹{(itemHistoryData?.summary?.total_clinic_use_amount || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#6d28d9', marginTop: 2 }}>
                      -{itemHistoryData?.summary?.total_clinic_use ?? 0} {itemHistoryData?.summary?.unit || 'units'}
                    </Text>
                    <Text style={{ fontSize: 9, color: '#7c3aed', marginTop: 1 }}>Consumed for clinic procedures and treatments (non-sale)</Text>
                  </View>
                </View>

                {/* Quick Actions: Add Stock & Stock Adjustment */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={openAddStockModal}
                    style={{ flex: 1, backgroundColor: '#15803d', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>➕ Add Stock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openAdjustModal}
                    style={{ flex: 1, backgroundColor: '#b45309', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>⚖️ Adjust Stock</Text>
                  </TouchableOpacity>
                </View>

                {/* Filter Chips */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 6 }}>Filter Log:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    {[
                      { key: 'ALL', label: `All (${itemHistoryData?.movements?.length || 0})` },
                      { key: 'CLINIC_USE', label: '🏥 Clinic Use' },
                      { key: 'SOLD', label: 'Sold' },
                      { key: 'ADDED', label: 'Added' },
                      { key: 'REDUCED_OR_ADJUSTED', label: 'Other Adjust' }
                    ].map(f => (
                      <TouchableOpacity
                        key={f.key}
                        onPress={() => handleFilterChange(f.key)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          marginRight: 8,
                          backgroundColor: historyFilter === f.key ? '#5C0B0B' : '#f3f4f6',
                          borderWidth: 1,
                          borderColor: historyFilter === f.key ? '#5C0B0B' : '#e5e7eb'
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: historyFilter === f.key ? 'bold' : '500', color: historyFilter === f.key ? '#fff' : '#4b5563' }}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Movements Log Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1f2937' }}>
                    Movement History (Newest First)
                  </Text>
                  {historyLoading && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#5C0B0B" />
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Syncing...</Text>
                    </View>
                  )}
                </View>

                {(!itemHistoryData?.movements || itemHistoryData.movements.length === 0) ? (
                  <View style={{ padding: 24, backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={{ fontSize: 24, marginBottom: 6 }}>📦</Text>
                    <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                      No stock movements recorded yet for this item.
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
                      Any addition, sale, or adjustment will automatically appear here permanently.
                    </Text>
                  </View>
                ) : (
                  itemHistoryData.movements.map((m, idx) => {
                    const isPositive = m.quantity > 0;
                    const deltaStr = isPositive ? `+${m.quantity}` : `${m.quantity}`;
                    const isClinic = m.movement_type === 'CLINIC_USE' || (m.reason && m.reason.includes('Clinic'));
                    const badgeBg = isClinic ? '#ede9fe' : (m.movement_type === 'OPENING_STOCK' ? '#f3e8ff' : (m.movement_type === 'ADDED' ? '#dcfce7' : (m.movement_type === 'SOLD' ? '#dbeafe' : '#fee2e2')));
                    const badgeColor = isClinic ? '#6d28d9' : (m.movement_type === 'OPENING_STOCK' ? '#6b21a8' : (m.movement_type === 'ADDED' ? '#15803d' : (m.movement_type === 'SOLD' ? '#1e40af' : '#b91c1c')));

                    return (
                      <View key={m.id || idx} style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', padding: 10, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <View style={{ backgroundColor: badgeBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: badgeColor }}>
                              {m.movement_type}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: 'bold', color: isPositive ? '#15803d' : '#dc2626' }}>
                            {deltaStr} {itemHistoryData?.item?.unit || 'units'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                          <Text style={{ fontSize: 11, color: '#4b5563' }}>
                            Stock: <Text style={{ fontWeight: 'bold' }}>{m.previous_quantity}</Text> → <Text style={{ fontWeight: 'bold', color: '#1f2937' }}>{m.new_quantity}</Text>
                          </Text>
                          <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                            {formatDateTime(m.created_at)}
                          </Text>
                        </View>

                        {m.reason ? (
                          <Text style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
                            📝 {m.reason}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                          <Text style={{ fontSize: 10, color: '#6b7280' }}>
                            👤 By: <Text style={{ fontWeight: '600' }}>{m.user_name || 'Staff'}</Text>
                          </Text>
                          {m.reference_type ? (
                            <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                              Ref: {m.reference_type}{m.reference_id ? ` #${m.reference_id}` : ''}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. ADD STOCK SUBMODAL */}
      <Modal
        visible={isAddStockModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddStockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <TouchableOpacity onPress={() => setIsAddStockModalVisible(false)} style={styles.modalTopBackBtn}>
                  <Text style={styles.modalTopBackText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  ➕ Add Stock
                </Text>
                <TouchableOpacity onPress={() => setIsAddStockModalVisible(false)} style={styles.modalTopCloseBtn}>
                  <Text style={styles.modalTopCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#166534', marginBottom: 10 }}>
                {selectedHistoryItem?.medicine_name}
              </Text>

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Quantity to Add ({selectedHistoryItem?.unit || 'units'}) *
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10, 25, 50..."
                keyboardType="numeric"
                value={addStockForm.quantity}
                onChangeText={(v) => setAddStockForm({ ...addStockForm, quantity: v })}
              />

              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {[5, 10, 25, 50, 100].map(n => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => {
                      const curr = parseFloat(addStockForm.quantity) || 0;
                      setAddStockForm({ ...addStockForm, quantity: String(curr + n) });
                    }}
                    style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#166534' }}>+{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Batch Number (Optional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Leave blank to keep existing batch"
                value={addStockForm.batch_number}
                onChangeText={(v) => setAddStockForm({ ...addStockForm, batch_number: v })}
              />

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Expiry Date (Optional, MM/YYYY)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 12/2026"
                value={addStockForm.expiry_date}
                onChangeText={(v) => setAddStockForm({ ...addStockForm, expiry_date: v })}
              />

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Reason / Source
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['Supplier Delivery', 'Stock Return', 'Bonus / Sample', 'Opening Stock', 'Other'].map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setAddStockForm({ ...addStockForm, reason: r })}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: addStockForm.reason === r ? '#166534' : '#f3f4f6',
                      borderWidth: 1,
                      borderColor: addStockForm.reason === r ? '#166534' : '#e5e7eb'
                    }}
                  >
                    <Text style={{ fontSize: 11, color: addStockForm.reason === r ? '#fff' : '#4b5563', fontWeight: addStockForm.reason === r ? 'bold' : 'normal' }}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Notes / Invoice Details
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Invoice #9988 from ABC Distributor"
                value={addStockForm.notes}
                onChangeText={(v) => setAddStockForm({ ...addStockForm, notes: v })}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#6b7280' }]}
                  onPress={() => setIsAddStockModalVisible(false)}
                  disabled={addStockLoading}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#15803d' }]}
                  onPress={handleSaveAddStock}
                  disabled={addStockLoading}
                >
                  {addStockLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalBtnText}>Confirm Add Stock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 3. STOCK ADJUSTMENT SUBMODAL */}
      <Modal
        visible={isAdjustModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAdjustModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <TouchableOpacity onPress={() => setIsAdjustModalVisible(false)} style={styles.modalTopBackBtn}>
                  <Text style={styles.modalTopBackText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  ⚖️ Adjust Stock
                </Text>
                <TouchableOpacity onPress={() => setIsAdjustModalVisible(false)} style={styles.modalTopCloseBtn}>
                  <Text style={styles.modalTopCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#b45309', marginBottom: 4 }}>
                {selectedHistoryItem?.medicine_name}
              </Text>
              <Text style={{ fontSize: 12, color: '#4b5563', marginBottom: 12 }}>
                Current Stock: <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedHistoryItem?.quantity || 0} {selectedHistoryItem?.unit || 'units'}</Text>
              </Text>

              {/* Direction Toggle */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    const isStaff = userRole !== 'ADMIN' && userRole !== 'DOCTOR';
                    setAdjustForm({
                      ...adjustForm,
                      direction: 'REDUCE',
                      reason_type: isStaff ? '🏥 Clinic Use' : adjustForm.reason_type,
                      quantity: isStaff ? '1' : adjustForm.quantity
                    });
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: adjustForm.direction === 'REDUCE' ? '#dc2626' : '#fee2e2',
                    borderWidth: 1,
                    borderColor: '#dc2626'
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustForm.direction === 'REDUCE' ? '#fff' : '#b91c1c' }}>
                    (-) Reduce Stock
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAdjustForm({ ...adjustForm, direction: 'ADD' })}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: adjustForm.direction === 'ADD' ? '#15803d' : '#dcfce7',
                    borderWidth: 1,
                    borderColor: '#15803d'
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: adjustForm.direction === 'ADD' ? '#fff' : '#166534' }}>
                    (+) Add / Correct
                  </Text>
                </TouchableOpacity>
              </View>

              {userRole !== 'ADMIN' && userRole !== 'DOCTOR' && (
                <View style={{ backgroundColor: '#f5f3ff', padding: 8, borderRadius: 6, marginBottom: 10, borderWidth: 1, borderColor: '#ddd6fe' }}>
                  <Text style={{ fontSize: 11, color: '#6d28d9', fontWeight: '500' }}>
                    🏥 Staff rule: You are authorized to deduct <Text style={{ fontWeight: 'bold' }}>1 unit at a time</Text> for <Text style={{ fontWeight: 'bold' }}>🏥 Clinic Use</Text>. For other reasons or bulk quantities, contact Doctor/Admin.
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Adjustment Quantity ({selectedHistoryItem?.unit || 'units'}) *
              </Text>
              <TextInput
                style={styles.input}
                placeholder={userRole !== 'ADMIN' && userRole !== 'DOCTOR' && adjustForm.direction === 'REDUCE' ? '1 (Staff limit: 1 unit)' : 'e.g. 1, 2, 5...'}
                keyboardType="numeric"
                value={adjustForm.quantity}
                onChangeText={(v) => setAdjustForm({ ...adjustForm, quantity: v })}
              />
              {userRole !== 'ADMIN' && userRole !== 'DOCTOR' && adjustForm.direction === 'REDUCE' && (
                <Text style={{ fontSize: 10, color: '#7c3aed', marginBottom: 8, marginTop: -4 }}>
                  ℹ️ Staff limit: Exactly 1 unit per clinic use entry
                </Text>
              )}

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Adjustment Reason *
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {['🏥 Clinic Use', 'Stock count correction', 'Damaged', 'Expired', 'Wastage', 'Returned to supplier', 'Other'].map(r => {
                  const isStaff = userRole !== 'ADMIN' && userRole !== 'DOCTOR';
                  const isRestrictedForStaff = isStaff && adjustForm.direction === 'REDUCE' && !r.includes('Clinic');
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => {
                        if (isRestrictedForStaff) {
                          return Alert.alert('Staff Restriction', 'Staff can only reduce stock for 🏥 Clinic Use (1 unit at a time). Other reduction reasons require Doctor or Admin.');
                        }
                        setAdjustForm({ ...adjustForm, reason_type: r });
                      }}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: adjustForm.reason_type === r ? '#b45309' : '#f3f4f6',
                        borderWidth: 1,
                        borderColor: adjustForm.reason_type === r ? '#b45309' : '#e5e7eb',
                        opacity: isRestrictedForStaff ? 0.45 : 1
                      }}
                    >
                      <Text style={{ fontSize: 11, color: adjustForm.reason_type === r ? '#fff' : (isRestrictedForStaff ? '#9ca3af' : '#4b5563'), fontWeight: adjustForm.reason_type === r ? 'bold' : 'normal' }}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
                Detailed Audit Notes (Optional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder={adjustForm.reason_type.includes('Clinic') ? 'e.g. Doctor procedure, in-house chemical peel, PRP session' : 'e.g. Broken seal, expired batch inspection, shelf audit'}
                value={adjustForm.notes}
                onChangeText={(v) => setAdjustForm({ ...adjustForm, notes: v })}
              />

              {adjustForm.reason_type.includes('Clinic') && (
                <View style={{ backgroundColor: '#f5f3ff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#c4b5fd', marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#5b21b6', marginBottom: 6 }}>
                    🏥 Clinic Use Valuation (Cost / MRP)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, color: '#6d28d9', fontWeight: '500' }}>Item Unit MRP (₹):</Text>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 4, height: 34, fontSize: 13, fontWeight: 'bold', color: '#5b21b6' }]}
                      keyboardType="numeric"
                      placeholder="0"
                      value={adjustForm.unit_price}
                      onChangeText={(v) => setAdjustForm({ ...adjustForm, unit_price: v })}
                    />
                  </View>
                  {(() => {
                    const q = parseFloat(adjustForm.quantity) || 0;
                    const u = parseFloat(adjustForm.unit_price) || 0;
                    const totalVal = Math.round(q * u);
                    return (
                      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#ddd6fe', flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, color: '#6d28d9' }}>Total Consumed Value:</Text>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#7c3aed' }}>
                          ₹{totalVal.toLocaleString('en-IN')} (Non-sale)
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* Result Preview */}
              {(() => {
                const cur = parseFloat(selectedHistoryItem?.quantity) || 0;
                const adj = parseFloat(adjustForm.quantity) || 0;
                const signed = adjustForm.direction === 'REDUCE' ? -adj : adj;
                const result = cur + signed;
                return (
                  <View style={{ backgroundColor: result < 0 ? '#fee2e2' : '#f8fafc', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: result < 0 ? '#fca5a5' : '#cbd5e1', marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: result < 0 ? '#991b1b' : '#334155', fontWeight: 'bold' }}>
                      {result < 0 ? '❌ Error: Resulting stock cannot be negative!' : `Preview: Current ${cur} → New ${result} ${selectedHistoryItem?.unit || 'units'}`}
                    </Text>
                  </View>
                );
              })()}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#6b7280' }]}
                  onPress={() => setIsAdjustModalVisible(false)}
                  disabled={adjustLoading}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#b45309' }]}
                  onPress={handleSaveAdjust}
                  disabled={adjustLoading}
                >
                  {adjustLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalBtnText}>Confirm Adjustment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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