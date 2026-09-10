import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiscountControl from './DiscountControl';

export default function SmartPharmacyCameraModal({
  visible,
  onClose,
  inventory = [],
  initialDate,
  onSaleCompleted
}) {
  const [step, setStep] = useState('CAPTURE'); // 'CAPTURE' | 'ANALYZING' | 'DRAFT'
  const [capturedImage, setCapturedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Draft state
  const [draftId, setDraftId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [patientSearchQ, setPatientSearchQ] = useState('');
  const [patientCandidates, setPatientCandidates] = useState([]);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [items, setItems] = useState([]);
  const [outOfStockList, setOutOfStockList] = useState([]);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [discount, setDiscount] = useState({ type: 'NONE', value: 0, amount: 0 });

  // Batch Picker Modal state
  const [batchModalItemIndex, setBatchModalItemIndex] = useState(null);

  // Add Product Picker state
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQ, setProductSearchQ] = useState('');

  // Fallback text input state
  const [manualText, setManualText] = useState('');
  const [showTextFallback, setShowTextFallback] = useState(false);

  useEffect(() => {
    if (visible) {
      resetState();
    }
  }, [visible]);

  const resetState = () => {
    setStep('CAPTURE');
    setCapturedImage(null);
    setLoading(false);
    setSubmitting(false);
    setDraftId(null);
    setPatient(null);
    setPatientSearchQ('');
    setPatientCandidates([]);
    setShowPatientSearch(false);
    setItems([]);
    setOutOfStockList([]);
    setPaymentMode('CASH');
    setDiscount({ type: 'NONE', value: 0, amount: 0 });
    setBatchModalItemIndex(null);
    setShowProductSearch(false);
    setProductSearchQ('');
    setManualText('');
    setShowTextFallback(false);
  };

  // Launch Camera
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Camera access is required to photograph handover medicines.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.6,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCapturedImage(asset.uri);
        analyzeImage(asset.base64, null);
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Camera Error', 'Could not open camera. You can choose from gallery or enter text.');
    }
  };

  // Pick from Gallery
  const handlePickGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Gallery Permission', 'Photo library access is required to select handover photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.6,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCapturedImage(asset.uri);
        analyzeImage(asset.base64, null);
      }
    } catch (err) {
      console.error('Gallery error:', err);
      Alert.alert('Gallery Error', 'Could not select photo.');
    }
  };

  // Text analysis fallback
  const handleAnalyzeText = () => {
    if (!manualText.trim()) {
      Alert.alert('Empty Text', 'Please type or paste product names / patient name.');
      return;
    }
    analyzeImage(null, manualText);
  };

  // Backend Analysis Call
  const analyzeImage = async (base64Data, textData) => {
    setStep('ANALYZING');
    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        image_base64: base64Data ? `data:image/jpeg;base64,${base64Data}` : null,
        raw_text: textData || null
      };

      const res = await axios.post('https://skinssence-api.onrender.com/api/pharmacy/camera/analyze', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;
      setDraftId(data.draft_id);
      setPatient(data.patient || null);
      setPatientCandidates(data.patient_candidates || []);
      setItems(data.items || []);
      setOutOfStockList(data.out_of_stock_items || []);
      setStep('DRAFT');
      setLoading(false);

      if (!data.patient) {
        setShowPatientSearch(true);
      }

      if ((!data.items || data.items.length === 0) && data.unmatched_items?.length > 0) {
        Alert.alert(
          'Notice',
          'Some items could not be automatically matched. You can quickly add them from the catalogue.'
        );
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setLoading(false);
      setStep('CAPTURE');
      Alert.alert(
        'Scan Failed',
        err.response?.data?.error || 'Failed to analyze photograph. Please check connection or use manual text entry.'
      );
    }
  };

  // Patient Search
  const handleSearchPatients = async (query) => {
    setPatientSearchQ(query);
    if (query.length > 2) {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await axios.get(`https://skinssence-api.onrender.com/api/patients/search?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPatientCandidates(res.data);
      } catch (e) {}
    }
  };

  const selectPatient = (p) => {
    setPatient({
      id: p.id,
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      phone: p.mobile || p.phone,
      patient_code: p.skinssence_id || p.patient_code,
      confidence: 'HIGH'
    });
    setShowPatientSearch(false);
    setPatientSearchQ('');
  };

  // Item Quantities
  const updateItemQty = (index, delta) => {
    setItems(items.map((it, i) => {
      if (i === index) {
        const newQty = Math.max(1, it.quantity + delta);
        return {
          ...it,
          quantity: newQty,
          amount: newQty * it.mrp
        };
      }
      return it;
    }));
  };

  // Item Instruction
  const updateItemInstruction = (index, text) => {
    setItems(items.map((it, i) => (i === index ? { ...it, instruction: text } : it)));
  };

  // Remove Item
  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Change Batch (FEFO override)
  const selectBatchForItem = (itemIndex, batch) => {
    setItems(items.map((it, i) => {
      if (i === itemIndex) {
        return {
          ...it,
          inventory_id: batch.id,
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          mrp: batch.mrp || it.mrp,
          amount: it.quantity * (batch.mrp || it.mrp),
          is_early_expiry: batch.is_early_expiry
        };
      }
      return it;
    }));
    setBatchModalItemIndex(null);
  };

  // Add Product from Catalog
  const addProductFromCatalog = (prod) => {
    const isPiranid = (prod.medicine_name || '').toLowerCase().includes('piranid');
    const defaultInstr = prod.default_instructions
      ? prod.default_instructions.split(',')[0].trim()
      : (isPiranid ? 'Apply twice daily post-procedure' : '');

    // Check if already in items
    const existingIndex = items.findIndex(it => it.medicine_name.toLowerCase() === prod.medicine_name.toLowerCase());
    if (existingIndex >= 0) {
      updateItemQty(existingIndex, 1);
    } else {
      setItems([
        ...items,
        {
          inventory_id: prod.id,
          medicine_name: prod.medicine_name,
          quantity: 1,
          mrp: prod.mrp || 0,
          amount: prod.mrp || 0,
          batch_number: prod.batch_number || 'N/A',
          expiry_date: prod.expiry_date || 'N/A',
          is_early_expiry: true,
          available_batches: [
            {
              id: prod.id,
              batch_number: prod.batch_number || 'N/A',
              expiry_date: prod.expiry_date || 'N/A',
              quantity: prod.quantity || 0,
              mrp: prod.mrp || 0,
              is_early_expiry: true
            }
          ],
          default_instructions: defaultInstr,
          instruction: defaultInstr,
          confidence: 'HIGH',
          similarity: 100
        }
      ]);
    }
    setShowProductSearch(false);
    setProductSearchQ('');
  };

  // Calculations
  const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
  const netPayable = Math.max(0, subtotal - (discount?.amount || 0));

  // Confirm Final Bill (Stock deduction occurs ONLY here!)
  const handleConfirmBill = async () => {
    if (!patient || !patient.id) {
      Alert.alert('Patient Required', 'Please select or confirm the patient before finalizing.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Empty Bill', 'No items in draft bill.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);

    const visitDateStr = initialDate ? new Date(initialDate).toISOString() : new Date().toISOString();

    const payload = {
      draft_id: draftId,
      patient_id: patient.id,
      payment_mode: paymentMode,
      visit_date: visitDateStr,
      subtotal: subtotal,
      discount_type: discount.type,
      discount_value: discount.value,
      discount_amount: discount.amount,
      net_payable: netPayable,
      amount_received: netPayable,
      photo_uri: capturedImage || null,
      medicines_sold: items.map(it => {
        let nameWithComp = it.medicine_name;
        if (it.mrp === 0 && !nameWithComp.toLowerCase().includes('complimentary')) {
          nameWithComp += ' [Complimentary]';
        }
        return {
          id: it.inventory_id,
          inventory_id: it.inventory_id,
          medicine_name: it.instruction ? `${nameWithComp} | ${it.instruction}` : nameWithComp,
          quantity: it.quantity,
          amount: it.amount,
          instruction: it.instruction,
          batch_number: it.batch_number || 'N/A',
          expiry_date: it.expiry_date || 'N/A'
        };
      })
    };

    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.post('https://skinssence-api.onrender.com/api/pharmacy/camera/confirm', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSubmitting(false);
      Alert.alert('Success', 'Smart Bill finalized! Stock deducted and sale recorded.');
      if (onSaleCompleted) {
        onSaleCompleted({
          visitId: res.data.visit_id,
          patient,
          payload,
          subtotal,
          discount,
          netPayable
        });
      }
      onClose();
    } catch (err) {
      console.error('Confirmation error:', err);
      setSubmitting(false);
      Alert.alert(
        'Confirmation Failed',
        err.response?.data?.error || 'Failed to finalize bill. Please check connection and try again.'
      );
    }
  };

  const filteredCatalog = inventory.filter(p =>
    (p.medicine_name || '').toLowerCase().includes(productSearchQ.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>

          {/* HEADER */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.headerIcon}>📷</Text>
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.headerTitle}>Smart Pharmacy Camera</Text>
                <Text style={styles.headerSubtitle}>
                  {step === 'CAPTURE' && 'Photograph handover medicines for instant billing'}
                  {step === 'ANALYZING' && 'Analyzing photo & matching catalog...'}
                  {step === 'DRAFT' && 'Review Draft Bill & Confirm to Deduct Stock'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* STEP 1: CAPTURE PHOTO OR TEXT */}
          {step === 'CAPTURE' && (
            <ScrollView contentContainerStyle={styles.captureBody}>
              <View style={styles.guideCard}>
                <Text style={styles.guideTitle}>⚡ Ultra-Fast Handover Billing</Text>
                <Text style={styles.guideText}>
                  1. Hand medicines to the patient.{'\n'}
                  2. Take a photo of the handed-over medicines/prescription slip.{'\n'}
                  3. App auto-identifies patient, matches 148 products, selects early expiry batches, and prepares your bill in seconds!
                </Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cameraBigBtn} onPress={handleTakePhoto}>
                  <Text style={styles.cameraBigIcon}>📸</Text>
                  <Text style={styles.cameraBigText}>Take Photo</Text>
                  <Text style={styles.cameraBigSub}>Open device camera</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.galleryBigBtn} onPress={handlePickGallery}>
                  <Text style={styles.galleryBigIcon}>🖼️</Text>
                  <Text style={styles.galleryBigText}>Upload Photo</Text>
                  <Text style={styles.galleryBigSub}>Choose from gallery</Text>
                </TouchableOpacity>
              </View>

              {/* Text Fallback Toggle */}
              <TouchableOpacity
                style={styles.textFallbackToggle}
                onPress={() => setShowTextFallback(!showTextFallback)}
              >
                <Text style={styles.textFallbackToggleText}>
                  {showTextFallback ? '▲ Hide Quick Text Entry' : '▼ Or Paste / Type Medicine Names'}
                </Text>
              </TouchableOpacity>

              {showTextFallback && (
                <View style={styles.textFallbackCard}>
                  <Text style={styles.textFallbackLabel}>Enter Patient & Medicine Names (e.g. Acnemoist x 2, Piranid):</Text>
                  <TextInput
                    style={styles.textFallbackInput}
                    multiline
                    numberOfLines={4}
                    placeholder="Patient: Himanshu Sharma&#10;Acnemoist cream x 2&#10;Piranid cream"
                    placeholderTextColor="#94A3B8"
                    value={manualText}
                    onChangeText={setManualText}
                  />
                  <TouchableOpacity style={styles.textAnalyzeBtn} onPress={handleAnalyzeText}>
                    <Text style={styles.textAnalyzeBtnText}>⚡ Analyze Text & Prepare Bill</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}

          {/* STEP 2: ANALYZING SPINNER */}
          {step === 'ANALYZING' && (
            <View style={styles.analyzingContainer}>
              {capturedImage && (
                <Image source={{ uri: capturedImage }} style={styles.analyzingThumb} resizeMode="cover" />
              )}
              <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 20 }} />
              <Text style={styles.analyzingTitle}>Recognizing Medicines & Patient...</Text>
              <Text style={styles.analyzingSubtitle}>
                Matching against 148 clinic products & selecting early expiry batches (FEFO)
              </Text>
            </View>
          )}

          {/* STEP 3: DRAFT BILL VERIFICATION & CONFIRMATION */}
          {step === 'DRAFT' && (
            <ScrollView style={styles.draftScrollView} contentContainerStyle={{ paddingBottom: 30 }}>

              {/* OUT OF STOCK / EXPIRED ITEMS NOTICE */}
              {outOfStockList.length > 0 && (
                <View style={styles.outOfStockAlertCard}>
                  <Text style={styles.outOfStockAlertTitle}>
                    ⚠️ Identified from Photo but Omitted from Bill:
                  </Text>
                  {outOfStockList.map((item, idx) => (
                    <Text key={idx} style={styles.outOfStockAlertItem}>
                      • <Text style={{ fontWeight: 'bold' }}>{item.product_name}</Text> ({item.reason === 'EXPIRED' ? 'Batch Expired' : 'Zero Quantity in Inventory'})
                    </Text>
                  ))}
                  <Text style={styles.outOfStockAlertSub}>
                    These products were recognized from the photo/hints, but omitted from the bill because they cannot be sold.
                  </Text>
                </View>
              )}

              {/* PATIENT CARD */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>👤 Patient Information</Text>
                  <TouchableOpacity
                    style={styles.changePatientBtn}
                    onPress={() => setShowPatientSearch(!showPatientSearch)}
                  >
                    <Text style={styles.changePatientBtnText}>
                      {patient ? '✎ Change Patient' : '+ Select Patient'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {patient ? (
                  <View style={styles.patientVerifiedBox}>
                    <Text style={styles.patientVerifiedName}>✓ {patient.name}</Text>
                    <Text style={styles.patientVerifiedMeta}>
                      Code: {patient.patient_code || 'N/A'} • Phone: {patient.phone || 'N/A'}
                    </Text>
                    {patient.confidence === 'HIGH' && (
                      <View style={styles.highBadge}>
                        <Text style={styles.highBadgeText}>✓ Auto-Identified from Photo</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.patientWarningBox}>
                    <Text style={styles.patientWarningText}>
                      ⚠️ Patient name not detected in photo. Please select patient below:
                    </Text>
                  </View>
                )}

                {/* Patient Search Drawer */}
                {showPatientSearch && (
                  <View style={styles.patientSearchBox}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search patient by name or phone..."
                      placeholderTextColor="#94A3B8"
                      value={patientSearchQ}
                      onChangeText={handleSearchPatients}
                    />
                    {patientCandidates.length > 0 ? (
                      <View style={styles.candidateList}>
                        {patientCandidates.slice(0, 5).map(p => (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.candidateRow}
                            onPress={() => selectPatient(p)}
                          >
                            <Text style={styles.candidateName}>
                              {p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim()}
                            </Text>
                            <Text style={styles.candidateMeta}>
                              {p.skinssence_id || p.patient_code || ''} • {p.mobile || p.phone || ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      patientSearchQ.length > 2 && (
                        <Text style={styles.noCandidateText}>No patients found</Text>
                      )
                    )}
                  </View>
                )}
              </View>

              {/* PRODUCTS TABLE */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    📦 Products Recognized ({items.length})
                  </Text>
                  <TouchableOpacity
                    style={styles.addProductBtn}
                    onPress={() => setShowProductSearch(true)}
                  >
                    <Text style={styles.addProductBtnText}>+ Add Product</Text>
                  </TouchableOpacity>
                </View>

                {items.length === 0 ? (
                  <View style={styles.emptyItemsBox}>
                    <Text style={styles.emptyItemsText}>
                      No products detected. Tap "+ Add Product" to select from inventory.
                    </Text>
                  </View>
                ) : (
                  items.map((item, idx) => (
                    <View key={idx} style={styles.itemCard}>
                      {/* Product Name & Remove */}
                      <View style={styles.itemHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{item.medicine_name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            {item.confidence === 'HIGH' ? (
                              <View style={styles.tagHigh}>
                                <Text style={styles.tagHighText}>✓ Matched ({item.similarity || 100}%)</Text>
                              </View>
                            ) : (
                              <View style={styles.tagMedium}>
                                <Text style={styles.tagMediumText}>⚠️ Suggested Match</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Batch & FEFO Display */}
                      <View style={styles.batchRow}>
                        <View style={styles.batchBadge}>
                          <Text style={styles.batchBadgeText}>
                            📅 Batch: {item.batch_number} • Exp: {item.expiry_date}
                          </Text>
                          {item.is_early_expiry && (
                            <Text style={styles.fefoBadgeText}>[FEFO Early Expiry]</Text>
                          )}
                        </View>

                        {item.available_batches && item.available_batches.length > 1 && (
                          <TouchableOpacity
                            style={styles.switchBatchBtn}
                            onPress={() => setBatchModalItemIndex(idx)}
                          >
                            <Text style={styles.switchBatchBtnText}>
                              Change ({item.available_batches.length} batches)
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Quantity & Rate */}
                      <View style={styles.qtyPriceRow}>
                        <View style={styles.qtyControlRow}>
                          <Text style={styles.qtyLabel}>Qty:</Text>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => updateItemQty(idx, -1)}
                          >
                            <Text style={styles.qtyBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyValue}>{item.quantity}</Text>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => updateItemQty(idx, 1)}
                          >
                            <Text style={styles.qtyBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.priceCol}>
                          <Text style={styles.rateText}>@ ₹{item.mrp}</Text>
                          <Text style={styles.itemAmountText}>₹{item.amount}</Text>
                        </View>
                      </View>

                      {/* Instructions */}
                      <View style={styles.instructionBox}>
                        <Text style={styles.instructionLabel}>Usage Instruction:</Text>
                        <TextInput
                          style={styles.instructionInput}
                          placeholder="e.g. Apply twice daily on clean face"
                          placeholderTextColor="#94A3B8"
                          value={item.instruction}
                          onChangeText={(txt) => updateItemInstruction(idx, txt)}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* BILLING SUMMARY & DISCOUNT */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>💰 Billing Summary</Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal:</Text>
                  <Text style={styles.summaryValue}>₹{subtotal}</Text>
                </View>

                {/* Integrated Discount Control */}
                <View style={{ marginVertical: 8 }}>
                  <DiscountControl
                    subtotal={subtotal}
                    onDiscountChange={(disc) => setDiscount(disc)}
                  />
                </View>

                <View style={[styles.summaryRow, styles.netPayableRow]}>
                  <Text style={styles.netPayableLabel}>Net Payable:</Text>
                  <Text style={styles.netPayableValue}>₹{netPayable}</Text>
                </View>

                {/* Payment Mode Selector */}
                <View style={styles.paymentModeRow}>
                  <Text style={styles.paymentModeLabel}>Payment Mode:</Text>
                  <View style={styles.modeButtonGroup}>
                    {['CASH', 'UPI', 'CARD'].map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[
                          styles.modeBtn,
                          paymentMode === mode && styles.modeBtnActive
                        ]}
                        onPress={() => setPaymentMode(mode)}
                      >
                        <Text
                          style={[
                            styles.modeBtnText,
                            paymentMode === mode && styles.modeBtnTextActive
                          ]}
                        >
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* ACTION BUTTONS */}
              <View style={styles.bottomActionContainer}>
                <TouchableOpacity
                  style={[styles.confirmBigBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleConfirmBill}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmBigBtnText}>
                      ✓ CONFIRM BILL & DEDUCT STOCK (₹{netPayable})
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    Alert.alert(
                      'Discard Draft?',
                      'No stock has been deducted. Are you sure you want to cancel?',
                      [
                        { text: 'Keep Editing', style: 'cancel' },
                        { text: 'Discard', style: 'destructive', onPress: onClose }
                      ]
                    );
                  }}
                >
                  <Text style={styles.cancelBtnText}>✕ Cancel Draft (Zero Stock Impact)</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          )}

          {/* BATCH PICKER SUB-MODAL */}
          {batchModalItemIndex !== null && (
            <Modal transparent animationType="fade" visible={batchModalItemIndex !== null}>
              <View style={styles.subModalOverlay}>
                <View style={styles.subModalCard}>
                  <Text style={styles.subModalTitle}>
                    Select Batch for {items[batchModalItemIndex]?.medicine_name}
                  </Text>
                  <Text style={styles.subModalSubtitle}>
                    Batches sorted by Earliest Expiry (FEFO):
                  </Text>

                  <ScrollView style={{ maxHeight: 250, marginVertical: 10 }}>
                    {items[batchModalItemIndex]?.available_batches?.map((b, bIdx) => (
                      <TouchableOpacity
                        key={b.id || bIdx}
                        style={[
                          styles.batchOptionRow,
                          items[batchModalItemIndex].inventory_id === b.id && styles.batchOptionActive
                        ]}
                        onPress={() => selectBatchForItem(batchModalItemIndex, b)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.batchOptionTitle}>
                            Batch: {b.batch_number} {b.is_early_expiry ? '⭐ [Earliest Expiry]' : ''}
                          </Text>
                          <Text style={styles.batchOptionMeta}>
                            Exp: {b.expiry_date} • Stock: {b.quantity} • MRP: ₹{b.mrp}
                          </Text>
                        </View>
                        {items[batchModalItemIndex].inventory_id === b.id && (
                          <Text style={styles.batchSelectedCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.closeSubModalBtn}
                    onPress={() => setBatchModalItemIndex(null)}
                  >
                    <Text style={styles.closeSubModalBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {/* ADD PRODUCT CATALOG SUB-MODAL */}
          {showProductSearch && (
            <Modal transparent animationType="fade" visible={showProductSearch}>
              <View style={styles.subModalOverlay}>
                <View style={styles.subModalCard}>
                  <Text style={styles.subModalTitle}>Add Product from Catalogue</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search ~148 clinic products..."
                    placeholderTextColor="#94A3B8"
                    value={productSearchQ}
                    onChangeText={setProductSearchQ}
                    autoFocus
                  />

                  <ScrollView style={{ maxHeight: 300, marginVertical: 10 }}>
                    {filteredCatalog.slice(0, 30).map(prod => (
                      <TouchableOpacity
                        key={prod.id}
                        style={styles.productCatalogRow}
                        onPress={() => addProductFromCatalog(prod)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.productCatalogName}>{prod.medicine_name}</Text>
                          <Text style={styles.productCatalogMeta}>
                            MRP: ₹{prod.mrp} • Stock: {prod.quantity} • Batch: {prod.batch_number || 'N/A'}
                          </Text>
                        </View>
                        <Text style={styles.addPlusBtn}>+ Add</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.closeSubModalBtn}
                    onPress={() => setShowProductSearch(false)}
                  >
                    <Text style={styles.closeSubModalBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    minHeight: '75%',
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC'
  },
  headerIcon: {
    fontSize: 26
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: 'bold'
  },
  captureBody: {
    padding: 20,
    alignItems: 'center'
  },
  guideCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 20,
    width: '100%'
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 6
  },
  guideText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16
  },
  cameraBigBtn: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }
  },
  cameraBigIcon: {
    fontSize: 36,
    marginBottom: 8
  },
  cameraBigText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800'
  },
  cameraBigSub: {
    color: '#D1FAE5',
    fontSize: 11,
    marginTop: 4
  },
  galleryBigBtn: {
    flex: 1,
    backgroundColor: '#0284C7',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0284C7',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }
  },
  galleryBigIcon: {
    fontSize: 36,
    marginBottom: 8
  },
  galleryBigText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800'
  },
  galleryBigSub: {
    color: '#E0F2FE',
    fontSize: 11,
    marginTop: 4
  },
  textFallbackToggle: {
    paddingVertical: 10
  },
  textFallbackToggleText: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '600'
  },
  textFallbackCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10
  },
  textFallbackLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8
  },
  textFallbackInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 80
  },
  textAnalyzeBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10
  },
  textAnalyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },
  analyzingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30
  },
  analyzingThumb: {
    width: 140,
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#0EA5E9'
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 14
  },
  analyzingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6
  },
  draftScrollView: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  outOfStockAlertCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  outOfStockAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 4
  },
  outOfStockAlertItem: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2
  },
  outOfStockAlertSub: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 6,
    fontStyle: 'italic'
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A'
  },
  changePatientBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  changePatientBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7'
  },
  patientVerifiedBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  patientVerifiedName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534'
  },
  patientVerifiedMeta: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 3
  },
  highBadge: {
    backgroundColor: '#DCFCE7',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6
  },
  highBadgeText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '600'
  },
  patientWarningBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  patientWarningText: {
    fontSize: 13,
    color: '#92400E'
  },
  patientSearchBox: {
    marginTop: 10
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A'
  },
  candidateList: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  candidateRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  candidateName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A'
  },
  candidateMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  noCandidateText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8
  },
  addProductBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  addProductBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1'
  },
  emptyItemsBox: {
    padding: 20,
    alignItems: 'center'
  },
  emptyItemsText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center'
  },
  itemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A'
  },
  tagHigh: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  tagHighText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '700'
  },
  tagMedium: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  tagMediumText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '700'
  },
  removeBtn: {
    padding: 4
  },
  removeBtnText: {
    fontSize: 16
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8
  },
  batchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1
  },
  batchBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  fefoBadgeText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '800',
    marginLeft: 6
  },
  switchBatchBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  switchBatchBtnText: {
    fontSize: 10,
    color: '#334155',
    fontWeight: '700'
  },
  qtyPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  qtyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 20,
    textAlign: 'center'
  },
  priceCol: {
    alignItems: 'flex-end'
  },
  rateText: {
    fontSize: 11,
    color: '#64748B'
  },
  itemAmountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  instructionBox: {
    marginTop: 6
  },
  instructionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2
  },
  instructionInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    color: '#0F172A'
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748B'
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A'
  },
  netPayableRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 4
  },
  netPayableLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  netPayableValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#059669'
  },
  paymentModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12
  },
  paymentModeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  modeButtonGroup: {
    flexDirection: 'row',
    gap: 6
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9'
  },
  modeBtnActive: {
    backgroundColor: '#0F172A'
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  modeBtnTextActive: {
    color: '#FFFFFF'
  },
  bottomActionContainer: {
    marginTop: 6,
    gap: 10
  },
  confirmBigBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }
  },
  confirmBigBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900'
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700'
  },
  subModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20
  },
  subModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%'
  },
  subModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  subModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  batchOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    borderRadius: 8
  },
  batchOptionActive: {
    backgroundColor: '#F0FDF4'
  },
  batchOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  batchOptionMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  batchSelectedCheck: {
    fontSize: 16,
    color: '#166534',
    fontWeight: 'bold'
  },
  closeSubModalBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8
  },
  closeSubModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  },
  productCatalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  productCatalogName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A'
  },
  productCatalogMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  addPlusBtn: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7'
  }
});
