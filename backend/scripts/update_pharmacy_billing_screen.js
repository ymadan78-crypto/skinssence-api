const fs = require('fs');
const path = require('path');

const filePath = path.resolve('mobile/screens/PharmacyBillingScreen.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add EditBillModal import
if (!content.includes("import EditBillModal from '../components/EditBillModal';")) {
  content = content.replace(
    "import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';",
    "import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';\nimport EditBillModal from '../components/EditBillModal';"
  );
}

// 2. Add Ionicons import if not present or ensure it is imported
if (!content.includes('Ionicons')) {
  content = content.replace(
    "import { View, Text,",
    "import { View, Text,\n  // icons\n"
  );
}

// Check where Ionicons is imported
console.log('Has Ionicons?', content.includes('Ionicons'));

// 3. Add state variables inside PharmacyBillingScreen
const stateMarker = "const [cameraModalVisible, setCameraModalVisible] = useState(false);";
const stateAdditions = `const [cameraModalVisible, setCameraModalVisible] = useState(false);
  // Recent Pharmacy Bills & Bill Editing
  const [editBillModalVisible, setEditBillModalVisible] = useState(false);
  const [selectedVisitIdForEdit, setSelectedVisitIdForEdit] = useState(null);
  const [recentBillsModalVisible, setRecentBillsModalVisible] = useState(false);
  const [recentBills, setRecentBills] = useState([]);
  const [recentBillsLoading, setRecentBillsLoading] = useState(false);
  const [recentBillsSearch, setRecentBillsSearch] = useState('');

  const fetchRecentBills = async (search = '') => {
    setRecentBillsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(\`https://skinssence-api-1.onrender.com/api/pharmacy/recent-bills?search=\${encodeURIComponent(search)}\`, {
        headers: { Authorization: \`Bearer \${token}\` },
        timeout: 10000
      });
      setRecentBills(res.data || []);
    } catch (err) {
      console.log('Error fetching recent pharmacy bills:', err.message);
    } finally {
      setRecentBillsLoading(false);
    }
  };
`;

if (!content.includes('recentBillsModalVisible')) {
  content = content.replace(stateMarker, stateAdditions);
}

// 4. Update Header with Edit Past Bills button and banner
const headerTarget = "<Text style={styles.headerTitle}>Pharmacy Billing</Text>";
const headerReplacement = `<View style={styles.screenHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pharmacy Billing</Text>
          <Text style={styles.headerSubtitle}>New Prescription & Direct Sales</Text>
        </View>
        <TouchableOpacity
          style={styles.editPastBillsHeaderBtn}
          onPress={() => {
            setRecentBillsModalVisible(true);
            fetchRecentBills('');
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.editPastBillsHeaderBtnText}>✏️ Edit Past Bills</Text>
        </TouchableOpacity>
      </View>

      {/* QUICK ACCESS BANNER FOR EDITING PAST PHARMACY BILLS */}
      <TouchableOpacity
        style={styles.editPastBillsBanner}
        onPress={() => {
          setRecentBillsModalVisible(true);
          fetchRecentBills('');
        }}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={styles.editBannerIconBox}>
            <Ionicons name="receipt" size={18} color="#5C0B0B" />
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.editPastBillsBannerTitle}>Edit / Correct Existing Bills</Text>
            <Text style={styles.editPastBillsBannerSub}>
              Change items, update quantities, split cash + UPI, or refund
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#5C0B0B" />
      </TouchableOpacity>`;

if (!content.includes('editPastBillsHeaderBtn')) {
  content = content.replace(headerTarget, headerReplacement);
}

// 5. Mount EditBillModal and RecentBillsModal before the closing </View>
const modalMountTarget = "<PharmacyCorrectionModal\n        visible={correctionModalVisible}\n        visitId={completedSale?.visitId}";
const modalMountTargetCRLF = modalMountTarget.replace(/\n/g, '\r\n');

const newModalsJSX = `{/* EDIT BILL MODAL (VISITS & PHARMACY BILLS) */}
      <EditBillModal
        visible={editBillModalVisible}
        visitId={selectedVisitIdForEdit}
        onClose={() => {
          setEditBillModalVisible(false);
          setSelectedVisitIdForEdit(null);
        }}
        onUpdated={() => {
          fetchInventory();
          fetchRecentBills(recentBillsSearch);
        }}
      />

      {/* RECENT PHARMACY BILLS MODAL */}
      <Modal
        visible={recentBillsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRecentBillsModalVisible(false)}
      >
        <View style={styles.recentBillsModalOverlay}>
          <View style={styles.recentBillsModalContent}>
            <View style={styles.recentBillsModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="receipt" size={20} color="#5C0B0B" />
                <Text style={styles.recentBillsModalTitle}>Recent Pharmacy Bills</Text>
              </View>
              <TouchableOpacity onPress={() => setRecentBillsModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.recentBillsSearchRow}>
              <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.recentBillsSearchInput}
                placeholder="Search by Patient Name, Mobile or Bill #..."
                value={recentBillsSearch}
                onChangeText={(text) => {
                  setRecentBillsSearch(text);
                  fetchRecentBills(text);
                }}
              />
              {recentBillsSearch ? (
                <TouchableOpacity onPress={() => { setRecentBillsSearch(''); fetchRecentBills(''); }}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {recentBillsLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#5C0B0B" />
                <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>Loading pharmacy bills...</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} keyboardShouldPersistTaps="handled">
                {recentBills.length === 0 ? (
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <Ionicons name="document-text-outline" size={36} color="#cbd5e1" />
                    <Text style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>No pharmacy bills found</Text>
                  </View>
                ) : (
                  recentBills.map((b) => {
                    const dateFormatted = b.visit_date ? new Date(b.visit_date).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '';

                    const paysSummary = (b.payments || []).map(p => \`\${p.mode}: ₹\${p.amount_received}\`).join(' • ');

                    return (
                      <View key={b.visit_id} style={styles.recentBillCard}>
                        <View style={styles.recentBillCardTop}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.recentBillPatientName}>{b.patient_name || 'Patient'}</Text>
                              <View style={styles.recentBillBadge}>
                                <Text style={styles.recentBillBadgeText}>#{b.visit_id}</Text>
                              </View>
                            </View>
                            <Text style={styles.recentBillMetaText}>
                              {b.skinssence_id ? \`ID: \${b.skinssence_id} • \` : ''}{b.mobile || ''} {dateFormatted ? \`• \${dateFormatted}\` : ''}
                            </Text>
                          </View>
                          <Text style={styles.recentBillTotalText}>₹{b.net_payable !== undefined ? b.net_payable : b.subtotal}</Text>
                        </View>

                        {/* Medicines snippet */}
                        {b.medicines && b.medicines.length > 0 && (
                          <View style={styles.recentBillMedsBox}>
                            {b.medicines.map((m, mIdx) => (
                              <Text key={m.id || mIdx} style={styles.recentBillMedLine} numberOfLines={1}>
                                💊 {m.details || 'Medicine'} — ₹{m.amount}
                              </Text>
                            ))}
                          </View>
                        )}

                        {paysSummary ? (
                          <Text style={styles.recentBillPaysSummary}>
                            💳 Paid: {paysSummary}
                          </Text>
                        ) : null}

                        {/* Action buttons */}
                        <View style={styles.recentBillActionsRow}>
                          <TouchableOpacity
                            style={styles.recentBillEditBtn}
                            onPress={() => {
                              setSelectedVisitIdForEdit(b.visit_id);
                              setEditBillModalVisible(true);
                            }}
                          >
                            <Ionicons name="pencil" size={13} color="#fff" style={{ marginRight: 4 }} />
                            <Text style={styles.recentBillEditBtnText}>✏️ Edit Bill & Split Pay</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.recentBillRefundBtn}
                            onPress={() => {
                              setCompletedSale({ visitId: b.visit_id });
                              setCorrectionModalVisible(true);
                            }}
                          >
                            <Ionicons name="build-outline" size={13} color="#5C0B0B" style={{ marginRight: 4 }} />
                            <Text style={styles.recentBillRefundBtnText}>Return / Refund</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      `;

if (content.includes(modalMountTarget)) {
  content = content.replace(modalMountTarget, newModalsJSX + modalMountTarget);
} else if (content.includes(modalMountTargetCRLF)) {
  content = content.replace(modalMountTargetCRLF, newModalsJSX.replace(/\n/g, '\r\n') + modalMountTargetCRLF);
}

// 6. Add Styles for new components
const styleMarker = "styles = StyleSheet.create({";
const newStyles = `
  screenHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 15,
    marginTop: 40,
    marginBottom: 10
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -16,
    marginLeft: 5
  },
  editPastBillsHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C0B0B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }
  },
  editPastBillsHeaderBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  editPastBillsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10
  },
  editBannerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editPastBillsBannerTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#9a3412'
  },
  editPastBillsBannerSub: {
    fontSize: 11,
    color: '#c2410c',
    marginTop: 1
  },
  recentBillsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end'
  },
  recentBillsModalContent: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '88%'
  },
  recentBillsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  recentBillsModalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  recentBillsSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    margin: 12,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  recentBillsSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a'
  },
  recentBillCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    elevation: 1
  },
  recentBillCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  recentBillPatientName: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  recentBillBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  recentBillBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569'
  },
  recentBillMetaText: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  recentBillTotalText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#15803d'
  },
  recentBillMedsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    marginTop: 8
  },
  recentBillMedLine: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16
  },
  recentBillPaysSummary: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '600',
    marginTop: 6
  },
  recentBillActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  recentBillEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C0B0B',
    paddingVertical: 7,
    borderRadius: 6
  },
  recentBillEditBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  recentBillRefundBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 7,
    borderRadius: 6
  },
  recentBillRefundBtnText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600'
  },
`;

if (!content.includes('screenHeaderRow:')) {
  content = content.replace(styleMarker, styleMarker + newStyles);
}

// Ensure Ionicons is imported
if (!content.includes("import { Ionicons } from '@expo/vector-icons';")) {
  content = "import { Ionicons } from '@expo/vector-icons';\n" + content;
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated PharmacyBillingScreen.js');
