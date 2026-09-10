import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  FlatList,
  Switch
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const API_URL = 'https://skinssence-api.onrender.com/api/procedures/master';

export default function MasterProcedureCatalogScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [procedures, setProcedures] = useState([]);
  const [filteredProcedures, setFilteredProcedures] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showInactive, setShowInactive] = useState(false);

  // Add / Edit Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Facial');
  const [formDesc, setFormDesc] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Merge Modal
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [sourceProc, setSourceProc] = useState(null);
  const [targetProc, setTargetProc] = useState(null);
  const [merging, setMerging] = useState(false);

  const categories = ['ALL', 'Facial', 'Laser', 'Hair', 'Skin', 'Injectable', 'Body', 'General'];

  useFocusEffect(
    useCallback(() => {
      fetchCatalog();
    }, [])
  );

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}?include_inactive=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProcedures(res.data || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to fetch procedure catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let list = [...procedures];

    if (!showInactive) {
      list = list.filter(p => p.active === 1);
    }

    if (selectedCategory !== 'ALL') {
      list = list.filter(p => (p.category || 'General').toLowerCase() === selectedCategory.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    setFilteredProcedures(list);
  }, [procedures, searchQuery, selectedCategory, showInactive]);

  const openAddModal = () => {
    setIsEditing(false);
    setCurrentId(null);
    setFormName('');
    setFormCategory('Facial');
    setFormDesc('');
    setFormActive(true);
    setModalVisible(true);
  };

  const openEditModal = (proc) => {
    setIsEditing(true);
    setCurrentId(proc.id);
    setFormName(proc.name);
    setFormCategory(proc.category || 'General');
    setFormDesc(proc.description || '');
    setFormActive(proc.active === 1);
    setModalVisible(true);
  };

  const handleSave = async (forceCreate = false) => {
    if (!formName.trim()) {
      return Alert.alert('Validation Error', 'Procedure name is required.');
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');

      if (isEditing) {
        await axios.put(`${API_URL}/${currentId}`, {
          name: formName.trim().toUpperCase(),
          category: formCategory,
          description: formDesc,
          active: formActive ? 1 : 0
        }, { headers: { Authorization: `Bearer ${token}` } });

        Alert.alert('Success', 'Procedure updated successfully!');
        setModalVisible(false);
        fetchCatalog();
      } else {
        // Create new procedure
        const payload = {
          name: formName.trim().toUpperCase(),
          category: formCategory,
          description: formDesc,
          force_create: forceCreate
        };

        const res = await axios.post(API_URL, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Check if similarity engine issued a warning
        if (res.data && res.data.warning) {
          setSaving(false);
          Alert.alert(
            '⚠️ Similar Procedure Found',
            `${res.data.message}\n\nExisting: [${res.data.existing.code}] ${res.data.existing.name} (${res.data.existing.category})`,
            [
              { text: 'Cancel / Use Existing', style: 'cancel' },
              {
                text: 'Yes, Add Anyway',
                onPress: () => handleSave(true)
              }
            ]
          );
          return;
        }

        Alert.alert('Success', res.data.message || 'Procedure created successfully!');
        setModalVisible(false);
        fetchCatalog();
      }
    } catch (err) {
      Alert.alert('Duplicate Detected', err.response?.data?.error || 'Failed to save procedure.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (proc) => {
    const nextState = proc.active === 1 ? 0 : 1;
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (nextState === 0) {
        await axios.delete(`${API_URL}/${proc.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API_URL}/${proc.id}`, {
          name: proc.name,
          category: proc.category,
          description: proc.description,
          active: 1
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchCatalog();
    } catch (err) {
      Alert.alert('Error', 'Failed to update procedure status.');
    }
  };

  const openMergeModal = (proc) => {
    setSourceProc(proc);
    setTargetProc(null);
    setMergeModalVisible(true);
  };

  const executeMerge = async () => {
    if (!sourceProc || !targetProc) {
      return Alert.alert('Selection Required', 'Please select a target master procedure to merge into.');
    }
    if (sourceProc.id === targetProc.id) {
      return Alert.alert('Invalid Selection', 'Source and target procedure cannot be the same.');
    }

    Alert.alert(
      'Confirm Procedure Merge',
      `Are you sure you want to merge:\n\n[${sourceProc.code}] "${sourceProc.name}"\n\nINTO\n\n[${targetProc.code}] "${targetProc.name}"?\n\nAll historical patient visits will be safely re-linked to [${targetProc.code}] and [${sourceProc.code}] will be retired.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Merge',
          style: 'destructive',
          onPress: async () => {
            setMerging(true);
            try {
              const token = await AsyncStorage.getItem('userToken');
              const res = await axios.post('https://skinssence-api.onrender.com/api/procedures/master/merge', {
                source_id: sourceProc.id,
                target_id: targetProc.id
              }, { headers: { Authorization: `Bearer ${token}` } });

              Alert.alert('Merge Complete', res.data.message);
              setMergeModalVisible(false);
              fetchCatalog();
            } catch (err) {
              Alert.alert('Merge Failed', err.response?.data?.error || 'Failed to merge procedures');
            } finally {
              setMerging(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Master Procedure Catalog</Text>
          <Text style={styles.headerSub}>Locked Names • Flexible Transaction Pricing</Text>
        </View>
        <TouchableOpacity style={styles.addHeaderBtn} onPress={openAddModal}>
          <Text style={styles.addHeaderBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR & INACTIVE TOGGLE */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search procedure name or code (e.g. P001, Hydra)..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />

        <View style={styles.filterRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.toggleLabel}>Show Inactive</Text>
            <Switch
              value={showInactive}
              onValueChange={setShowInactive}
              trackColor={{ false: '#cbd5e1', true: '#fca5a5' }}
              thumbColor={showInactive ? '#ef4444' : '#94a3b8'}
            />
          </View>
          <Text style={styles.countText}>{filteredProcedures.length} Procedures</Text>
        </View>

        {/* CATEGORY TABS */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
              onPress={() => setSelectedCategory(cat)}>
              <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* PROCEDURES LIST */}
      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 40 }} />
      ) : filteredProcedures.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No Procedures Found</Text>
          <Text style={styles.emptySub}>No procedures match your search or category filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProcedures}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
          renderItem={({ item }) => (
            <View style={[styles.card, item.active === 0 && styles.cardInactive]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeText}>{item.code || `P${item.id}`}</Text>
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.procName}>{item.name}</Text>
                    <Text style={styles.categoryBadge}>{item.category || 'General'}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[styles.statusBadge, { backgroundColor: item.active === 1 ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: item.active === 1 ? '#15803d' : '#b91c1c' }}>
                      {item.active === 1 ? '● ACTIVE' : '○ INACTIVE'}
                    </Text>
                  </View>
                </View>
              </View>

              {item.description ? (
                <Text style={styles.procDesc}>{item.description}</Text>
              ) : null}

              {/* DYNAMIC REFERENCE STATS (NON-BINDING) */}
              <View style={styles.statsBox}>
                <Text style={styles.statItem}>
                  📊 Billed: <Text style={{ fontWeight: 'bold' }}>{item.total_sessions || 0}</Text> sessions
                </Text>
                {item.last_price > 0 && (
                  <Text style={styles.statItem}>
                    • Last: <Text style={{ fontWeight: 'bold', color: '#047857' }}>₹{item.last_price}</Text>
                  </Text>
                )}
                {item.avg_price > 0 && (
                  <Text style={styles.statItem}>
                    • Recent Avg: <Text style={{ fontWeight: 'bold', color: '#1d4ed8' }}>₹{item.avg_price}</Text>
                  </Text>
                )}
              </View>

              {/* ACTION BUTTONS */}
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtnEdit} onPress={() => openEditModal(item)}>
                  <Text style={styles.actionBtnEditText}>✏️ Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtnMerge} onPress={() => openMergeModal(item)}>
                  <Text style={styles.actionBtnMergeText}>🔄 Merge</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnToggle, item.active === 1 ? styles.actionBtnDeactivate : styles.actionBtnActivate]}
                  onPress={() => handleToggleActive(item)}>
                  <Text style={item.active === 1 ? styles.actionBtnDeactivateText : styles.actionBtnActivateText}>
                    {item.active === 1 ? 'Deactivate' : 'Activate'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ADD / EDIT MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isEditing ? `Edit Procedure (${formName})` : '+ Add Master Procedure'}
            </Text>
            <Text style={styles.modalSub}>
              Procedure names are locked & controlled. Prices remain 100% flexible during billing.
            </Text>

            <Text style={styles.inputLabel}>Procedure Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. KOREAN GLASS SKIN FACIAL"
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {categories.filter(c => c !== 'ALL').map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catPickChip, formCategory === c && styles.catPickChipActive]}
                  onPress={() => setFormCategory(c)}>
                  <Text style={[styles.catPickChipText, formCategory === c && styles.catPickChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Optional Description / Clinical Protocol</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              placeholder="e.g. 6-step triple antioxidant infusion"
              value={formDesc}
              onChangeText={setFormDesc}
              multiline
            />

            {isEditing && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 }}>
                <Text style={styles.inputLabel}>Active Status</Text>
                <Switch
                  value={formActive}
                  onValueChange={setFormActive}
                  trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                  thumbColor={formActive ? '#16a34a' : '#94a3b8'}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <TouchableOpacity
                style={[styles.btnCancel, { flex: 1, marginRight: 8 }]}
                onPress={() => setModalVisible(false)}
                disabled={saving}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, { flex: 1, marginLeft: 8 }]}
                onPress={() => handleSave(false)}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnSubmitText}>{isEditing ? 'Save Changes' : 'Add Procedure'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MERGE MODAL */}
      <Modal visible={mergeModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔄 Merge Procedure Variations</Text>
            <Text style={styles.modalSub}>
              Merge multiple spelling or historical variations into one canonical Master Procedure.
            </Text>

            {sourceProc && (
              <View style={styles.mergeSourceBox}>
                <Text style={{ fontSize: 12, color: '#991b1b', fontWeight: 'bold' }}>SOURCE (Will be retired):</Text>
                <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1f2937', marginTop: 2 }}>
                  [{sourceProc.code}] {sourceProc.name}
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Select Canonical Target Procedure:</Text>
            <ScrollView style={{ maxHeight: 200, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 }}>
              {procedures
                .filter(p => sourceProc && p.id !== sourceProc.id && p.active === 1)
                .map(target => (
                  <TouchableOpacity
                    key={target.id}
                    style={[
                      styles.mergeTargetItem,
                      targetProc && targetProc.id === target.id && styles.mergeTargetItemActive
                    ]}
                    onPress={() => setTargetProc(target)}>
                    <Text style={{ fontWeight: 'bold', color: targetProc && targetProc.id === target.id ? '#1e40af' : '#334155' }}>
                      [{target.code}] {target.name} ({target.category})
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <TouchableOpacity
                style={[styles.btnCancel, { flex: 1, marginRight: 8 }]}
                onPress={() => setMergeModalVisible(false)}
                disabled={merging}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, { flex: 1, marginLeft: 8, backgroundColor: '#dc2626' }]}
                onPress={executeMerge}
                disabled={merging || !targetProc}>
                {merging ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnSubmitText}>Merge & Reassign</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C0B0B',
    padding: 18,
    paddingTop: 50,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16
  },
  backBtn: { marginRight: 12 },
  backText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerSub: { color: '#fca5a5', fontSize: 11, marginTop: 2 },
  addHeaderBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addHeaderBtnText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 13 },
  searchSection: { padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  searchInput: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  toggleLabel: { fontSize: 13, color: '#475569', fontWeight: '600', marginRight: 8 },
  countText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  categoryScroll: { marginTop: 10 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 6
  },
  categoryChipActive: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  categoryChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1
  },
  cardInactive: { opacity: 0.6, backgroundColor: '#f8fafc' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  codeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  codeText: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  procName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  categoryBadge: { fontSize: 11, color: '#64748b', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  procDesc: { fontSize: 12, color: '#64748b', marginTop: 6, fontStyle: 'italic' },
  statsBox: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: 8, borderRadius: 6, marginTop: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  statItem: { fontSize: 12, color: '#475569', marginRight: 10 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  actionBtnEdit: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#eff6ff', marginRight: 6 },
  actionBtnEditText: { fontSize: 12, color: '#1e40af', fontWeight: 'bold' },
  actionBtnMerge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#fef3c7', marginRight: 6 },
  actionBtnMergeText: { fontSize: 12, color: '#92400e', fontWeight: 'bold' },
  actionBtnToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  actionBtnDeactivate: { backgroundColor: '#fee2e2' },
  actionBtnDeactivateText: { fontSize: 12, color: '#991b1b', fontWeight: 'bold' },
  actionBtnActivate: { backgroundColor: '#dcfce7' },
  actionBtnActivateText: { fontSize: 12, color: '#166534', fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  emptySub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 4 },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 12, backgroundColor: '#f8fafc' },
  catPickChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', marginRight: 6, marginBottom: 6 },
  catPickChipActive: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  catPickChipText: { fontSize: 12, color: '#475569' },
  catPickChipTextActive: { color: '#fff', fontWeight: 'bold' },
  btnCancel: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  btnCancelText: { color: '#475569', fontWeight: 'bold' },
  btnSubmit: { backgroundColor: '#5C0B0B', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnSubmitText: { color: '#fff', fontWeight: 'bold' },
  mergeSourceBox: { backgroundColor: '#fee2e2', padding: 10, borderRadius: 8, marginVertical: 8, borderWidth: 1, borderColor: '#fca5a5' },
  mergeTargetItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  mergeTargetItemActive: { backgroundColor: '#dbeafe' }
});
