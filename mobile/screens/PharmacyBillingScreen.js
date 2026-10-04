import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Linking, Modal, Vibration } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DiscountControl from '../components/DiscountControl';
import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';
import SmartPharmacyCameraModal from '../components/SmartPharmacyCameraModal';

import { HEADER_BANNER_BASE64, LOGO_BASE64 } from '../constants/billAssets';
import { renameBillPdfAsync } from '../utils/billNaming';
import { previewBillPdfAsync, shareBillToWhatsAppAsync } from '../utils/whatsappShare';

export default function PharmacyBillingScreen({ navigation, route }) {
  const [inventory, setInventory] = useState([]);
  const [cart, setCart] = useState([]);
  const [patients, setPatients] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [medSearchQ, setMedSearchQ] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(route?.params?.patient || null);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [upiAccount, setUpiAccount] = useState('STORE'); // 'STORE' | 'CLINIC'
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitUpiAmount, setSplitUpiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [billStatus, setBillStatus] = useState('IDLE'); // 'IDLE' | 'GENERATING' | 'READY' | 'ERROR'
  const [billErrorMsg, setBillErrorMsg] = useState('');
  const [discount, setDiscount] = useState({ type: 'NONE', value: 0, amount: 0 });
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [saleDate, setSaleDate] = useState(() => {
    if (route?.params?.visitDate) {
      const d = new Date(route.params.visitDate);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [inventoryLoading, setInventoryLoading] = useState(false);

  useEffect(() => {
    // 1. Immediately hydrate from AsyncStorage cache for instant 0ms access
    AsyncStorage.getItem('@cached_pharmacy_inventory').then(cached => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setInventory(parsed);
          }
        } catch (e) {}
      }
    });
    // 2. Fetch fresh inventory from server
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setInventoryLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/inventory', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const isExpClient = (expStr) => {
        if (!expStr || typeof expStr !== 'string' || !expStr.trim()) return false;
        const clean = expStr.trim();
        const now = new Date();
        const currentMonthVal = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + 1;
        let expVal = 99999999;
        if (/^\d{1,2}\/\d{4}$/.test(clean)) {
          const [m, y] = clean.split('/');
          expVal = parseInt(`${y}${m.padStart(2, '0')}01`, 10);
        } else if (/^\d{1,2}\/\d{2}$/.test(clean)) {
          const [m, y] = clean.split('/');
          const fullY = parseInt(y, 10) > 70 ? `19${y}` : `20${y}`;
          expVal = parseInt(`${fullY}${m.padStart(2, '0')}01`, 10);
        }
        return expVal < currentMonthVal;
      };
      const activeItems = (res.data || []).filter(m => (m.quantity || 0) > 0 && !isExpClient(m.expiry_date));
      setInventory(activeItems);
      // Persist to local cache for instant future loads
      AsyncStorage.setItem('@cached_pharmacy_inventory', JSON.stringify(activeItems)).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setInventoryLoading(false);
    }
  };

  // Smart relevance-ranked search:
  // 1. Prefix match (item name starts with query) -> TOP PRIORITY
  // 2. Word-boundary match (any word in item name starts with query) -> SECOND PRIORITY
  // 3. Substring match (query anywhere in item name) -> THIRD PRIORITY
  const filteredAndSortedInventory = useMemo(() => {
    const q = (medSearchQ || '').trim().toLowerCase();
    if (!q) return inventory;

    return inventory
      .filter(med => (med.medicine_name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const nameA = (a.medicine_name || '').toLowerCase();
        const nameB = (b.medicine_name || '').toLowerCase();

        const aStarts = nameA.startsWith(q);
        const bStarts = nameB.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = nameA.split(/\s+/).some(w => w.startsWith(q));
        const bWordStarts = nameB.split(/\s+/).some(w => w.startsWith(q));
        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return nameA.localeCompare(nameB);
      });
  }, [inventory, medSearchQ]);

  const handleSearchPatient = async (text) => {
    setSearchQ(text);
    if (text.length > 2) {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await axios.get(`https://skinssence-api.onrender.com/api/patients/search?q=${text}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPatients(res.data);
      } catch (e) {}
    } else {
      setPatients([]);
    }
  };

  const updateQuantity = useCallback((id, delta) => {
    try {
      Vibration.vibrate(8);
    } catch (e) {}

    setCart(prevCart => {
      const item = prevCart.find(c => c.id === id);
      if (!item) return prevCart;

      const newQty = item.qty + delta;
      if (newQty <= 0) {
        return prevCart.filter(c => c.id !== id);
      }

      if (delta > 0 && item.quantity && newQty > item.quantity) {
        Alert.alert('Out of Stock', `Cannot add more than available stock (${item.quantity}).`);
        return prevCart;
      }

      return prevCart.map(c => {
        if (c.id === id) {
          const effectivePrice = c.is_complimentary ? 0 : (c.unit_price !== undefined ? c.unit_price : (c.mrp || 0));
          return {
            ...c,
            qty: newQty,
            total: newQty * effectivePrice
          };
        }
        return c;
      });
    });
  }, []);

  const addToCart = useCallback((med, forceComplimentary = null) => {
    try {
      Vibration.vibrate(8);
    } catch (e) {}

    const isPiranid = (med.medicine_name || '').toLowerCase().includes('piranid');
    const complimentaryFlag = forceComplimentary !== null ? forceComplimentary : isPiranid;

    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === med.id);
      if (existing) {
        if (med.quantity && existing.qty >= med.quantity) {
          Alert.alert('Out of Stock', `Cannot add more than available stock (${med.quantity}).`);
          return prevCart;
        }
        const isComp = forceComplimentary !== null ? forceComplimentary : existing.is_complimentary;
        const unitPrice = isComp ? 0 : (med.mrp || 0);
        const nextQty = existing.qty + 1;
        return prevCart.map(c => c.id === med.id ? { 
          ...c, 
          qty: nextQty, 
          is_complimentary: isComp, 
          unit_price: unitPrice, 
          total: nextQty * unitPrice 
        } : c);
      } else {
        const defaultInstr = isPiranid 
          ? 'Apply twice daily post-procedure' 
          : (med.default_instructions ? med.default_instructions.split(',')[0].trim() : '');
        const unitPrice = complimentaryFlag ? 0 : (med.mrp || 0);
        return [...prevCart, { 
          ...med, 
          qty: 1, 
          is_complimentary: complimentaryFlag, 
          unit_price: unitPrice, 
          total: unitPrice, 
          instruction: defaultInstr 
        }];
      }
    });
  }, []);

  const toggleComplimentary = (id) => {
    setCart(cart.map(c => {
      if (c.id === id) {
        const nextComp = !c.is_complimentary;
        const effectiveUnitPrice = nextComp ? 0 : c.mrp;
        return {
          ...c,
          is_complimentary: nextComp,
          unit_price: effectiveUnitPrice,
          total: c.qty * effectiveUnitPrice
        };
      }
      return c;
    }));
  };

  const updateInstruction = (id, txt) => {
    setCart(cart.map(c => c.id === id ? { ...c, instruction: txt } : c));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(c => c.id !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
  const netPayable = Math.max(0, totalAmount - (discount?.amount || 0));

  const handleCheckout = async () => {
    if (!selectedPatient) return Alert.alert('Error', 'Please select a patient first.');
    if (cart.length === 0) return Alert.alert('Error', 'Cart is empty.');
    if (loading) return;

    setLoading(true);
    const patientSnapshot = selectedPatient;
    const cartSnapshot = [...cart];
    const subtotalSnapshot = totalAmount;
    const discountSnapshot = { ...discount };
    const netPayableSnapshot = netPayable;
    const modeSnapshot = paymentMode;
    const dateSnapshot = saleDate;
    const visitDateStr = (dateSnapshot || new Date()).toISOString();

    const upiModeName = upiAccount === 'CLINIC' ? 'UPI (Clinic)' : 'UPI (Store)';
    let effectiveMode = modeSnapshot;
    let splitPaymentsPayload = null;
    let effectiveAmountReceived = netPayableSnapshot;

    if (modeSnapshot === 'CASH + UPI') {
      const cashAmt = parseFloat(splitCashAmount) || 0;
      const upiAmt = parseFloat(splitUpiAmount) || 0;
      const totalSplit = cashAmt + upiAmt;
      if (Math.round(totalSplit) !== Math.round(netPayableSnapshot)) {
        setLoading(false);
        return Alert.alert(
          'Split Total Mismatch',
          `Cash (₹${cashAmt}) + UPI (₹${upiAmt}) = ₹${totalSplit}, but Net Payable is ₹${netPayableSnapshot}. Please adjust to match.`
        );
      }
      effectiveMode = `Cash: ₹${cashAmt} + ${upiModeName}: ₹${upiAmt}`;
      splitPaymentsPayload = [
        { mode: 'CASH', amount: cashAmt },
        { mode: upiModeName, amount: upiAmt }
      ];
      effectiveAmountReceived = totalSplit;
    } else if (modeSnapshot === 'UPI') {
      effectiveMode = upiModeName;
      splitPaymentsPayload = [
        { mode: upiModeName, amount: netPayableSnapshot }
      ];
    }

    const payload = {
      patient_id: patientSnapshot.id,
      payment_mode: effectiveMode,
      split_payments: splitPaymentsPayload,
      visit_date: visitDateStr,
      subtotal: subtotalSnapshot,
      discount_type: discountSnapshot.type,
      discount_value: discountSnapshot.value,
      discount_amount: discountSnapshot.amount,
      net_payable: netPayableSnapshot,
      amount_received: effectiveAmountReceived,
      medicines_sold: cartSnapshot.map(c => {
        let nameWithComp = c.medicine_name;
        if (c.is_complimentary && !nameWithComp.toLowerCase().includes('complimentary')) {
          nameWithComp += ' [Complimentary]';
        }
        return {
          id: c.id,
          medicine_name: c.instruction ? `${nameWithComp} | ${c.instruction}` : nameWithComp,
          quantity: c.qty,
          amount: c.total,
          instruction: c.instruction,
          batch_number: c.batch_number || 'N/A'
        };
      })
    };

    try {
      const token = await AsyncStorage.getItem('userToken');

      // STAGE 1: SAVE TRANSACTION TO DATABASE FIRST
      const idempotencyKey = `pharm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await axios.post(`https://skinssence-api.onrender.com/api/pharmacy/sell`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-idempotency-key': idempotencyKey
        }
      });

      const visitId = res.data.visit_id;

      // Immediately clear cart, discount & patient to prevent any accidental re-submission
      setCart([]);
      setDiscount({ type: 'NONE', value: 0, amount: 0 });
      setSelectedPatient(null);
      setSearchQ('');
      setSplitCashAmount('');
      setSplitUpiAmount('');
      setUpiAccount('STORE');
      fetchInventory(); // refresh inventory stock in background

      const saleRecord = {
        visitId,
        patient: patientSnapshot,
        payload,
        invoiceNumber: null,
        pdfUri: null
      };

      setCompletedSale(saleRecord);
      setBillModalVisible(true);
      setLoading(false);

      // STAGE 2: ASYNCHRONOUSLY GENERATE BILL (DECOUPLED)
      generateBillAsync(saleRecord);

    } catch (err) {
      console.log('Error saving pharmacy sale:', err);
      setLoading(false);
      Alert.alert(
        'Sale Failed',
        err.response?.data?.error || 'Failed to save pharmacy sale. Please check your network connection and try again.'
      );
    }
  };

  const handleCameraSaleCompleted = (saleData) => {
    fetchInventory();
    const saleRecord = {
      visitId: saleData.visitId,
      patient: saleData.patient,
      payload: saleData.payload,
      invoiceNumber: null,
      pdfUri: null
    };
    setCompletedSale(saleRecord);
    setBillModalVisible(true);
    generateBillAsync(saleRecord);
  };

  const generateBillAsync = async (saleRecord) => {
    if (!saleRecord) return;
    setBillStatus('GENERATING');
    setBillErrorMsg('');

    try {
      const token = await AsyncStorage.getItem('userToken');
      let invoiceNumber = `SKN-PHARM-${saleRecord.visitId}`;

      const recSubtotal = saleRecord.payload.subtotal ?? saleRecord.payload.amount_received;
      const recDiscAmt = saleRecord.payload.discount_amount ?? 0;
      const recDiscType = saleRecord.payload.discount_type ?? 'NONE';
      const recDiscVal = saleRecord.payload.discount_value ?? 0;
      const recNet = saleRecord.payload.net_payable ?? saleRecord.payload.amount_received;

      // 1. Create Invoice record in DB (non-blocking / resilient)
      try {
        const invRes = await axios.post('https://skinssence-api.onrender.com/api/invoices', {
          patient_id: saleRecord.payload.patient_id,
          visit_id: saleRecord.visitId,
          items_json: saleRecord.payload.medicines_sold.map(m => ({
            name: m.medicine_name,
            qty: m.quantity,
            amount: m.amount,
            instruction: m.instruction,
            batch: m.batch_number
          })),
          subtotal: recSubtotal,
          discount_type: recDiscType,
          discount_value: recDiscVal,
          discount_amount: recDiscAmt,
          discount: recDiscAmt,
          grand_total: recNet,
          net_payable: recNet,
          payment_mode: saleRecord.payload.payment_mode,
          amount_paid: saleRecord.payload.amount_received
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 3500 });

        if (invRes.data && invRes.data.invoice_number) {
          invoiceNumber = invRes.data.invoice_number;
        }
      } catch (invErr) {
        console.log('Invoice DB record save failed (non-fatal, using fallback ID):', invErr.message);
      }

      const saleDateObj = saleRecord.payload.visit_date ? new Date(saleRecord.payload.visit_date) : new Date();
      const dateStr = saleDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + saleDateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      let rows = '';
      
      saleRecord.payload.medicines_sold.forEach((m, index) => {
        let dispName = m.medicine_name;
        if (dispName.includes(' | ')) { dispName = dispName.split(' | ')[0]; }
        const isFree = m.amount === 0 || dispName.toLowerCase().includes('complimentary');
        
        rows += `
          <tr>
            <td style="padding: 12px; text-align: center;">${index + 1}</td>
            <td style="padding: 12px;">
              <strong>${dispName}</strong>
              ${isFree ? '&nbsp;<span style="background-color: #dcfce7; color: #15803d; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #86efac;">COMPLIMENTARY</span>' : ''}
              <br><span style="color: #666; font-size: 12px;">Batch: ${m.batch_number}</span>
              ${m.instruction ? `<br><span style="color: #5C0B0B; font-size: 14px; font-style: italic; font-weight: bold;">Usage: ${m.instruction}</span>` : ''}
            </td>
            <td style="padding: 12px; text-align: center;">${m.quantity}</td>
            <td style="padding: 12px; text-align: right;">${isFree ? '<span style="color: #15803d; font-weight: bold;">Rs. 0.00 (Free)</span>' : `Rs. ${(m.amount / m.quantity).toFixed(2)}`}</td>
            <td style="padding: 12px; text-align: right; font-weight: bold;">${isFree ? '<span style="color: #15803d;">Rs. 0.00</span>' : `Rs. ${m.amount.toFixed(2)}`}</td>
          </tr>`;
      });

      const patientName = `${saleRecord.patient?.first_name || ''} ${saleRecord.patient?.last_name || ''}`.trim() || 'Valued Patient';
      const patientMobile = saleRecord.patient?.mobile || '-';

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #222; }
              .header-container { display: flex; align-items: center; border-bottom: 3px solid #5C0B0B; padding-bottom: 20px; margin-bottom: 20px; }
              .header-text { flex: 1; }
              h1 { color: #5C0B0B; margin: 0 0 5px 0; font-size: 32px; letter-spacing: 1px; }
              h2 { color: #444; margin: 0; font-size: 16px; font-weight: 500; }
              h3 { color: #777; margin-top: 15px; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; text-align: right; }
              
              .info-table { width: 100%; margin-bottom: 30px; font-size: 14px; }
              .info-table td { padding: 5px; border: none; }
              .info-label { font-weight: bold; color: #555; width: 120px; }
              
              table { width: 100%; margin-top: 20px; border-collapse: collapse; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background-color: #5C0B0B; color: white; font-weight: bold; text-transform: uppercase; font-size: 13px; text-align: center; }
              
              .total-row { background-color: #f9f9f9; font-size: 18px; font-weight: bold; }
              .footer { margin-top: 60px; text-align: center; font-size: 13px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
              .go-green { color: #2e7d32; font-weight: bold; margin-top: 15px; font-size: 14px; background-color: #e8f5e9; padding: 10px; border-radius: 5px; display: inline-block; }
            </style>
          </head>
          <body>
            <div class="header-container">
              <div style="flex: 1;">
                <img src="${HEADER_BANNER_BASE64}" style="max-height:85px;max-width:350px;object-fit:contain;" />
                <h2 style="color:#222;font-size:14px;font-weight:bold;margin:6px 0 2px 0;">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</h2>
                <h2 style="color:#555;font-size:12px;margin:2px 0;">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</h2>
                <h2 style="color:#555;font-size:12px;margin:2px 0;">📞 095091 97578 &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.skinssence.in</h2>
              </div>
              <div>
                <h3 style="color:#5C0B0B;border:2px solid #5C0B0B;padding:6px 12px;border-radius:5px;">PHARMACY BILL</h3>
              </div>
            </div>
            
            <table class="info-table">
              <tr>
                <td class="info-label">Patient Name:</td>
                <td>${patientName}</td>
                <td class="info-label">Invoice Date:</td>
                <td>${dateStr}</td>
              </tr>
              <tr>
                <td class="info-label">Mobile:</td>
                <td>${patientMobile}</td>
                <td class="info-label">Invoice No:</td>
                <td>${invoiceNumber}</td>
              </tr>
              <tr>
                <td class="info-label">Doctor:</td>
                <td>Dr. Ashima Madan</td>
                <td class="info-label">Payment Mode:</td>
                <td>${saleRecord.payload.payment_mode}</td>
              </tr>
            </table>

            <table>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="text-align: left;">Medicine & Instructions</th>
                <th style="width: 10%;">Qty</th>
                <th style="width: 15%; text-align: right;">Unit Price</th>
                <th style="width: 20%; text-align: right;">Total Amount</th>
              </tr>
              ${rows}
              ${recDiscAmt > 0 ? `
              <tr style="background-color: #fdfdfd; font-size: 15px;">
                <td colspan="4" style="text-align: right; padding: 10px 15px; color: #555;">Subtotal:</td>
                <td style="text-align: right; padding: 10px 15px; color: #333;">Rs. ${recSubtotal.toFixed(2)}</td>
              </tr>
              <tr style="background-color: #fff1f2; font-size: 15px; color: #b91c1c;">
                <td colspan="4" style="text-align: right; padding: 10px 15px; font-weight: bold;">
                  Discount ${recDiscType === 'PERCENT' ? `(${recDiscVal}%):` : ':'}
                </td>
                <td style="text-align: right; padding: 10px 15px; font-weight: bold; color: #b91c1c;">- Rs. ${recDiscAmt.toFixed(2)}</td>
              </tr>
              ` : ''}
              <tr class="total-row">
                <td colspan="4" style="text-align: right; padding: 15px;">Total Amount:</td>
                <td style="text-align: right; padding: 15px; color: #5C0B0B;">Rs. ${recNet.toFixed(2)}</td>
              </tr>
              <tr style="background-color: #f0fdf4; font-size: 15px; color: #166534; font-weight: bold;">
                <td colspan="4" style="text-align: right; padding: 10px 15px;">Amount Received (${saleRecord.payload.payment_mode}):</td>
                <td style="text-align: right; padding: 10px 15px; color: #166534;">Rs. ${recNet.toFixed(2)}</td>
              </tr>
              <tr style="background-color: #f8fafc; font-size: 13px; color: #64748b;">
                <td colspan="4" style="text-align: right; padding: 8px 15px;">Balance Remaining:</td>
                <td style="text-align: right; padding: 8px 15px; color: #15803d; font-weight: bold;">Rs. 0.00 (Fully Paid)</td>
              </tr>
            </table>
            
            <div class="footer">
              <p>Thank you for choosing Skinssence Laser and Skincare Clinic!</p>
              <p>For queries, call 095091 97578 or visit www.skinssence.in</p>
              <p>Auth. Signatory</p>
              <div class="go-green">🌿 Go Green! Thank you for choosing a digital e-receipt to save paper.</div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      // Rename from temporary random UUID to [Patient_Name]_Skinssence_[Invoice_Number].pdf
      const patientFullName = `${saleRecord.patient?.first_name || ''} ${saleRecord.patient?.last_name || ''}`.trim() || 'Patient';
      const { uri: namedPdfUri, filename: brandedFilename } = await renameBillPdfAsync(uri, patientFullName, invoiceNumber);

      setCompletedSale(prev => ({
        ...prev,
        invoiceNumber,
        pdfUri: namedPdfUri,
        pdfFilename: brandedFilename
      }));
      setBillStatus('READY');

    } catch (e) {
      console.log('PDF Generation Error:', e);
      setBillStatus('ERROR');
      setBillErrorMsg(e?.message || 'Failed to render PDF bill document.');
    }
  };

  const handleWhatsAppPDF = () => {
    if (!completedSale?.pdfUri) {
      Alert.alert('PDF Not Ready', 'The PDF bill file is not available yet.');
      return;
    }
    shareBillToWhatsAppAsync({
      pdfUri: completedSale.pdfUri,
      filename: completedSale.pdfFilename,
      patient: completedSale.patient
    });
  };

  const handleWhatsAppText = () => {
    if (!completedSale) return;
    const patientName = `${completedSale.patient?.first_name || ''}`.trim() || 'Patient';
    const mobile = completedSale.patient?.mobile;
    const msg = `Dear ${patientName},\n\nThank you for your pharmacy purchase of Rs. ${completedSale.payload.amount_received} at Skinssence Clinic.\n\nInvoice: ${completedSale.invoiceNumber || ('#' + completedSale.visitId)}\n\nItems:\n` +
      completedSale.payload.medicines_sold.map(m => {
        const isFree = m.amount === 0 || m.medicine_name.toLowerCase().includes('complimentary');
        return `• ${m.medicine_name.split(' | ')[0]} (Qty: ${m.quantity}) - ${isFree ? 'COMPLIMENTARY (Rs. 0)' : `Rs. ${m.amount}`}`;
      }).join('\n') +
      `\n\nTotal: Rs. ${completedSale.payload.amount_received} (${completedSale.payload.payment_mode})\n\n🌿 Go Green! This is your digital receipt.\n\nWarm regards,\nTeam Skinssence`;
    
    if (mobile) {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}&phone=91${mobile}`);
    } else {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
    }
  };

  const handleSharePDF = async () => {
    if (completedSale?.pdfUri) {
      await Sharing.shareAsync(completedSale.pdfUri, {
        dialogTitle: completedSale.pdfFilename || completedSale.invoiceNumber || 'Pharmacy Bill',
        mimeType: 'application/pdf',
        UTI: '.pdf'
      });
    } else {
      Alert.alert('PDF Not Ready', 'The PDF bill file is not available yet.');
    }
  };

  const handlePrintPDF = async () => {
    if (completedSale?.pdfUri) {
      await Print.printAsync({ uri: completedSale.pdfUri });
    } else {
      Alert.alert('PDF Not Ready', 'The PDF bill file is not available yet.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Pharmacy Billing</Text>
      <ScrollView>
        
        {/* Patient Selection */}
        
        {/* PROMINENT SMART CAMERA BUTTON */}
        <TouchableOpacity
          style={styles.smartCameraBannerBtn}
          onPress={() => setCameraModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.smartCameraBannerLeft}>
            <View style={styles.smartCameraIconCircle}>
              <Text style={{ fontSize: 24 }}>📷</Text>
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.smartCameraBannerTitle}>SMART BILL FROM CAMERA</Text>
                <View style={styles.smartCameraBadge}>
                  <Text style={styles.smartCameraBadgeText}>⚡ 1-TAP</Text>
                </View>
              </View>
              <Text style={styles.smartCameraBannerSub}>
                Photograph handover medicines • Auto-identifies patient, products & early expiry
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Select Patient</Text>
          {!selectedPatient ? (
            <>
              <TextInput style={styles.input} placeholder="Search Name or Mobile..." value={searchQ} onChangeText={handleSearchPatient} />
              {patients.map(p => (
                <TouchableOpacity key={p.id} style={styles.patientItem} onPress={() => { setSelectedPatient(p); setPatients([]); setSearchQ(''); }}>
                  <Text style={styles.pName}>{p.first_name} {p.last_name}</Text>
                  <Text style={styles.pPhone}>{p.mobile}</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.selectedPatient}>
              <Text style={styles.pName}>{selectedPatient.first_name} {selectedPatient.last_name}</Text>
              <TouchableOpacity onPress={() => setSelectedPatient(null)}><Text style={{color:'red'}}>Change</Text></TouchableOpacity>
            </View>
          )}

          {/* Bill / Sale Date Picker */}
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#475569' }}>📅 Bill / Sale Date:</Text>
              {saleDate.toDateString() !== new Date().toDateString() && (
                <TouchableOpacity 
                  onPress={() => setSaleDate(new Date())}
                  style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fde68a' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309' }}>Reset to Today</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: saleDate.toDateString() !== new Date().toDateString() ? '#fffbeb' : '#f8fafc',
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: saleDate.toDateString() !== new Date().toDateString() ? '#f59e0b' : '#cbd5e1'
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: saleDate.toDateString() !== new Date().toDateString() ? '#b45309' : '#1e293b' }}>
                {saleDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                {saleDate.toDateString() === new Date().toDateString() ? ' (Today)' : ' (Past Date)'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#2563eb' }}>Change Date 🗓️</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={saleDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setShowDatePicker(false);
                  if (d) setSaleDate(d);
                }}
              />
            )}
          </View>
        </View>

        {/* Inventory Selection */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.sectionTitle}>2. Add Medicines</Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#eff6ff', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => navigation.navigate('InventoryManagement')}
            >
              <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 'bold' }}>📦 + Add Stock / Medicine</Text>
            </TouchableOpacity>
          </View>
          <TextInput 
            style={styles.input} 
            placeholder="Search for a medicine..." 
            value={medSearchQ} 
            onChangeText={setMedSearchQ}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {inventoryLoading && inventory.length === 0 ? (
            <View style={{ paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#5C0B0B" />
              <Text style={{ color: '#64748b', fontSize: 13 }}>Loading pharmacy inventory...</Text>
            </View>
          ) : filteredAndSortedInventory.length === 0 ? (
            <View style={{ paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginVertical: 4 }}>
              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>
                {medSearchQ.trim() ? `No medicines matching "${medSearchQ.trim()}" found.` : 'No medicines available in stock.'}
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
              {filteredAndSortedInventory.map(med => {
                const isPiranid = (med.medicine_name || '').toLowerCase().includes('piranid');
                return (
                  <View key={med.id} style={[styles.medCard, isPiranid && { borderColor: '#f472b6', borderWidth: 1.5, backgroundColor: '#fff5f7' }]}>
                    <Text style={styles.medName}>{isPiranid ? '🎁 ' : ''}{med.medicine_name}</Text>
                    <Text style={styles.medStock}>Stock: {med.quantity} • Batch: {med.batch_number || 'N/A'}</Text>
                    <Text style={styles.medPrice}>Rs. {med.mrp}</Text>
                    {isPiranid ? (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        <TouchableOpacity 
                          style={{ flex: 1, backgroundColor: '#15803d', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 4, alignItems: 'center' }} 
                          onPress={() => addToCart(med, true)}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>+ Free (₹0)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={{ flex: 1, backgroundColor: '#5C0B0B', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 4, alignItems: 'center' }} 
                          onPress={() => addToCart(med, false)}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>+ MRP (₹{med.mrp})</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      cart.find(c => c.id === med.id)?.qty > 0 ? (
                        <View style={styles.medCardStepper}>
                          <TouchableOpacity 
                            style={styles.medCardStepBtnMinus} 
                            activeOpacity={0.5} 
                            touchSoundDisabled={false}
                            onPress={() => updateQuantity(med.id, -1)}>
                            <Text style={styles.medCardStepBtnMinusText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.medCardQtyText}>{cart.find(c => c.id === med.id)?.qty} in cart</Text>
                          <TouchableOpacity 
                            style={styles.medCardStepBtnPlus} 
                            activeOpacity={0.5} 
                            touchSoundDisabled={false}
                            onPress={() => updateQuantity(med.id, 1)}>
                            <Text style={styles.medCardStepBtnPlusText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={styles.medCardAddBtn} 
                          activeOpacity={0.6} 
                          touchSoundDisabled={false}
                          onPress={() => addToCart(med)}>
                          <Text style={styles.medCardAddBtnText}>+ Add to Cart</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Cart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Cart</Text>
          {cart.length === 0 && <Text style={{color:'#888'}}>Cart is empty</Text>}
          {cart.map((c, i) => (
            <View key={i} style={styles.cartItemContainer}>
              <View style={styles.cartRow}>
                <View style={{flex:1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <Text style={styles.cartName}>{c.medicine_name}</Text>
                    {c.is_complimentary && (
                      <View style={{backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#86efac'}}>
                        <Text style={{color: '#15803d', fontSize: 11, fontWeight: 'bold'}}>🎁 COMPLIMENTARY</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity 
                        style={styles.stepperBtn} 
                        activeOpacity={0.5} 
                        touchSoundDisabled={false}
                        onPress={() => updateQuantity(c.id, -1)}>
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <View style={styles.stepperValueBox}>
                        <Text style={styles.stepperValueText}>{c.qty}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.stepperBtn} 
                        activeOpacity={0.5} 
                        touchSoundDisabled={false}
                        onPress={() => updateQuantity(c.id, 1)}>
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cartUnitPriceText}>
                      x {c.is_complimentary ? 'Rs. 0 (Free)' : `Rs. ${c.mrp}`}
                    </Text>
                  </View>
                </View>
                <View style={{alignItems: 'flex-end', marginLeft: 10}}>
                  <Text style={[styles.cartTotal, c.is_complimentary && {color: '#16a34a'}]}>
                    {c.is_complimentary ? 'Rs. 0' : `Rs. ${c.total}`}
                  </Text>
                  {(c.medicine_name || '').toLowerCase().includes('piranid') && (
                    <TouchableOpacity 
                      onPress={() => toggleComplimentary(c.id)}
                      style={{
                        marginTop: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 4,
                        backgroundColor: c.is_complimentary ? '#fee2e2' : '#f0fdf4',
                        borderWidth: 1,
                        borderColor: c.is_complimentary ? '#fca5a5' : '#bbf7d0'
                      }}
                    >
                      <Text style={{fontSize: 11, fontWeight: '600', color: c.is_complimentary ? '#b91c1c' : '#16a34a'}}>
                        {c.is_complimentary ? 'Charge MRP' : 'Complimentary (₹0)'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity onPress={() => removeFromCart(c.id)} style={{marginLeft: 12, padding: 5}}>
                  <Text style={{color:'red', fontWeight:'bold', fontSize: 18}}>X</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.instructionInput}
                placeholder="Usage instructions (e.g. Apply at night)"
                value={c.instruction}
                onChangeText={(txt) => updateInstruction(c.id, txt)}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                {(c.default_instructions
                  ? c.default_instructions.split(',').map(i => i.trim()).filter(Boolean)
                  : ['OD (Once)', 'BD (Twice)', 'TDS (Thrice)', 'Apply at Night', 'Wash after 2 hrs']
                ).map(preset => (
                  <TouchableOpacity key={preset} style={[styles.presetChip, c.instruction === preset && {backgroundColor: '#5C0B0B', borderColor: '#5C0B0B'}]} onPress={() => updateInstruction(c.id, preset)}>
                    <Text style={[styles.presetText, c.instruction === preset && {color: '#fff'}]}>{preset}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          {/* Dedicated Piranid Option Box */}
          {cart.some(c => (c.medicine_name || '').toLowerCase().includes('piranid')) && (
            <View style={styles.piranidDedicatedBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>🎁</Text>
                <Text style={styles.piranidDedicatedTitle}>Piranid Cream Option (Separate from Total Discount)</Text>
              </View>
              <Text style={styles.piranidDedicatedSubtitle}>
                Choose whether Piranid is given complimentary (post-procedure) or charged standard MRP:
              </Text>
              <View style={styles.piranidToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.piranidToggleBtn,
                    cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'))?.is_complimentary && styles.piranidToggleBtnActiveFree
                  ]}
                  onPress={() => {
                    const pItem = cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'));
                    if (pItem && !pItem.is_complimentary) toggleComplimentary(pItem.id);
                  }}
                >
                  <Text style={[
                    styles.piranidToggleText,
                    cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'))?.is_complimentary && styles.piranidToggleTextActive
                  ]}>
                    ✓ 🎁 Complimentary (₹0 Free)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.piranidToggleBtn,
                    !cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'))?.is_complimentary && styles.piranidToggleBtnActivePaid
                  ]}
                  onPress={() => {
                    const pItem = cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'));
                    if (pItem && pItem.is_complimentary) toggleComplimentary(pItem.id);
                  }}
                >
                  <Text style={[
                    styles.piranidToggleText,
                    !cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'))?.is_complimentary && styles.piranidToggleTextActive
                  ]}>
                    💵 Charge MRP (₹{cart.find(c => (c.medicine_name || '').toLowerCase().includes('piranid'))?.mrp || 280})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {cart.length > 0 && (
            <View style={{marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6'}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                <Text style={{fontSize: 15, color: '#6b7280'}}>Items Subtotal:</Text>
                <Text style={{fontSize: 15, fontWeight: '600', color: '#111827'}}>Rs. {totalAmount}</Text>
              </View>
              <DiscountControl
                subtotal={totalAmount}
                discount={discount}
                onChangeDiscount={setDiscount}
              />
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb'}}>
                <Text style={styles.grandTotal}>Total Amount:</Text>
                <Text style={[styles.grandTotal, {color: '#5C0B0B'}]}>Rs. {netPayable}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Checkout */}
        {cart.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Payment & Checkout</Text>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12}}>
              {['CASH', 'UPI', 'CASH + UPI', 'CARD'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.payBtn, paymentMode === mode && styles.payBtnActive]}
                  onPress={() => {
                    setPaymentMode(mode);
                    if (mode === 'CASH + UPI' && !splitCashAmount && !splitUpiAmount && netPayable > 0) {
                      const half = Math.round(netPayable / 2);
                      setSplitCashAmount(half.toString());
                      setSplitUpiAmount((netPayable - half).toString());
                    }
                  }}
                >
                  <Text style={paymentMode === mode ? {color:'#fff', fontWeight: 'bold'} : {color:'#000', fontWeight: '500'}}>{mode}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dual UPI Account Selection (Store by default, Clinic on 1-tap) */}
            {(paymentMode === 'UPI' || paymentMode === 'CASH + UPI') && (
              <View style={styles.upiAccountBox}>
                <Text style={styles.upiAccountLabel}>Receiving UPI Account:</Text>
                <View style={styles.upiAccountRow}>
                  <TouchableOpacity
                    style={[styles.upiAccountBtn, upiAccount === 'STORE' && styles.upiAccountBtnActive]}
                    onPress={() => setUpiAccount('STORE')}
                  >
                    <Text style={[styles.upiAccountBtnText, upiAccount === 'STORE' && styles.upiAccountBtnTextActive]}>
                      🛒 Skincare Store (Default)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.upiAccountBtn, upiAccount === 'CLINIC' && styles.upiAccountBtnActive]}
                    onPress={() => setUpiAccount('CLINIC')}
                  >
                    <Text style={[styles.upiAccountBtnText, upiAccount === 'CLINIC' && styles.upiAccountBtnTextActive]}>
                      🏥 Laser & Clinic
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Split Cash + UPI Breakdown */}
            {paymentMode === 'CASH + UPI' && (
              <View style={styles.splitBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.splitBoxTitle}>Split Payment (Cash + UPI)</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const half = Math.round(netPayable / 2);
                      setSplitCashAmount(half.toString());
                      setSplitUpiAmount((netPayable - half).toString());
                    }}
                    style={styles.splitHalfBtn}
                  >
                    <Text style={styles.splitHalfBtnText}>⚡ 50/50 Split</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.splitInputLabel}>Cash Amount (₹)</Text>
                    <TextInput
                      style={styles.splitInput}
                      keyboardType="numeric"
                      value={splitCashAmount}
                      onChangeText={(val) => {
                        setSplitCashAmount(val);
                        const c = parseFloat(val) || 0;
                        if (netPayable >= c) {
                          setSplitUpiAmount((netPayable - c).toFixed(0));
                        }
                      }}
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.splitInputLabel}>UPI Amount (₹)</Text>
                    <TextInput
                      style={styles.splitInput}
                      keyboardType="numeric"
                      value={splitUpiAmount}
                      onChangeText={(val) => setSplitUpiAmount(val)}
                      placeholder="0"
                    />
                  </View>
                </View>

                <View style={styles.splitSummaryRow}>
                  <Text style={styles.splitSummaryText}>
                    Total: <Text style={{ fontWeight: 'bold', color: '#166534' }}>₹{((parseFloat(splitCashAmount) || 0) + (parseFloat(splitUpiAmount) || 0)).toFixed(0)}</Text>
                  </Text>
                  <Text style={[styles.splitSummaryText, { color: '#64748b' }]}>
                    Net Payable: ₹{netPayable.toFixed(0)}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.checkoutBtn, loading && {opacity: 0.7}]} onPress={handleCheckout} disabled={loading}>
              <Text style={styles.checkoutText}>
                {loading ? 'Saving Sale to Database...' : `Complete Sale & Collect Rs. ${netPayable}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Decoupled Bill Lifecycle Modal */}
      <Modal
        visible={billModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (billStatus === 'READY' || billStatus === 'ERROR') {
            setBillModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.billModalContent}>

            {/* Status 1: GENERATING */}
            {billStatus === 'GENERATING' && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="large" color="#28a745" style={{ marginBottom: 15 }} />
                <Text style={styles.modalSuccessTitle}>✅ Sale Saved Successfully!</Text>
                <Text style={styles.modalSubText}>Visit ID: #{completedSale?.visitId}</Text>
                <Text style={{ textAlign: 'center', color: '#555', marginVertical: 12, fontSize: 14 }}>
                  Generating PDF bill and registering invoice number...
                </Text>
                <TouchableOpacity 
                  style={[styles.modalSecondaryBtn, { marginTop: 15 }]} 
                  onPress={() => setBillModalVisible(false)}
                >
                  <Text style={styles.modalSecondaryBtnText}>Close (Keep in Background)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Status 2: READY */}
            {billStatus === 'READY' && (
              <View>
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <View style={styles.successIconCircle}>
                    <Text style={{ fontSize: 30 }}>🧾</Text>
                  </View>
                  <Text style={styles.modalSuccessTitle}>Sale & Bill Complete!</Text>
                  <View style={styles.invoiceBadgeContainer}>
                    <Text style={styles.invoiceBadge}>{completedSale?.invoiceNumber}</Text>
                  </View>
                  {completedSale?.pdfFilename && (
                    <View style={{ marginTop: 8, backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#86efac' }}>
                      <Text style={{ fontSize: 11, color: '#166534', fontWeight: 'bold' }}>
                        📄 {completedSale.pdfFilename}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.billSummaryBox}>
                  <Text style={styles.summaryLabel}>Patient: <Text style={styles.summaryVal}>{completedSale?.patient?.first_name} {completedSale?.patient?.last_name || ''}</Text></Text>
                  <Text style={styles.summaryLabel}>Mobile: <Text style={styles.summaryVal}>{completedSale?.patient?.mobile || '-'}</Text></Text>
                  <Text style={styles.summaryLabel}>Amount: <Text style={[styles.summaryVal, { color: '#28a745', fontWeight: 'bold' }]}>Rs. {completedSale?.payload?.amount_received} ({completedSale?.payload?.payment_mode})</Text></Text>
                  <Text style={styles.summaryLabel}>Medicines: <Text style={styles.summaryVal}>{completedSale?.payload?.medicines_sold?.length} item(s)</Text></Text>
                </View>

                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity style={styles.modalActionBtnPrimary} onPress={handlePrintPDF}>
                    <Text style={styles.modalActionBtnText}>🖨️ View / Print PDF Bill</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.modalActionBtnWhatsApp} onPress={handleWhatsAppPDF}>
                    <Text style={styles.modalActionBtnText}>💬 Send WhatsApp PDF Bill</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.modalActionBtnSecondary} onPress={handleSharePDF}>
                    <Text style={styles.modalActionBtnSecondaryText}>📤 Share PDF File</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.modalActionBtnSecondary, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, marginTop: 10 }]} 
                    onPress={() => setCorrectionModalVisible(true)}
                  >
                    <Text style={[styles.modalActionBtnSecondaryText, { color: '#1d4ed8', fontWeight: 'bold' }]}>
                      ✏️ Wrong Mode? Switch Cash ↔ UPI
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.modalActionBtnDone, { marginTop: 12 }]} 
                    onPress={() => setBillModalVisible(false)}
                  >
                    <Text style={styles.modalActionBtnDoneText}>🏁 Done / Start New Sale</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Status 3: ERROR (Bill failed, but sale is 100% saved) */}
            {billStatus === 'ERROR' && (
              <View>
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ fontSize: 36 }}>⚠️</Text>
                  <Text style={[styles.modalSuccessTitle, { color: '#d97706' }]}>Sale Saved, Bill Delayed</Text>
                  <Text style={styles.modalSubText}>Visit #{completedSale?.visitId} is safely recorded!</Text>
                </View>

                <View style={[styles.billSummaryBox, { backgroundColor: '#fffbeb', borderColor: '#fef3c7' }]}>
                  <Text style={{ color: '#92400e', fontSize: 13, lineHeight: 18 }}>
                    The transaction and inventory deductions were <Text style={{ fontWeight: 'bold' }}>saved successfully</Text>. Only PDF generation encountered an issue:
                  </Text>
                  <Text style={{ color: '#b45309', fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
                    {billErrorMsg || 'Rendering error'}
                  </Text>
                </View>

                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity 
                    style={styles.modalActionBtnPrimary} 
                    onPress={() => generateBillAsync(completedSale)}
                  >
                    <Text style={styles.modalActionBtnText}>🔄 Retry Bill Generation</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.modalActionBtnDone, { marginTop: 12 }]} 
                    onPress={() => setBillModalVisible(false)}
                  >
                    <Text style={styles.modalActionBtnDoneText}>🏁 Done / Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      </Modal>

      {/* Pharmacy Sale Correction Modal */}
      <PharmacyCorrectionModal
        visible={correctionModalVisible}
        visitId={completedSale?.visitId}
        onClose={() => setCorrectionModalVisible(false)}
        onUpdated={() => {
          fetchInventory();
        }}
      />

    
      {/* SMART PHARMACY CAMERA MODAL */}
      <SmartPharmacyCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        inventory={inventory}
        initialDate={saleDate}
        onSaleCompleted={handleCameraSaleCompleted}
      />
    </View>
  );

}

const styles = StyleSheet.create({
  smartCameraBannerBtn: {
    backgroundColor: '#059669',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8
  },
  smartCameraBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  smartCameraIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  smartCameraBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  smartCameraBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  smartCameraBadgeText: {
    color: '#854D0E',
    fontSize: 10,
    fontWeight: '900'
  },
  smartCameraBannerSub: {
    color: '#E6F4EA',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3
  },


  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden'
  },
  stepperBtn: {
    width: 32,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#334155'
  },
  stepperValueBox: {
    paddingHorizontal: 12,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e2e8f0'
  },
  stepperValueText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  cartUnitPriceText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500'
  },
  medCardStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    backgroundColor: '#fdf2f2',
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  medCardStepBtnMinus: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 4
  },
  medCardStepBtnMinusText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#b91c1c'
  },
  medCardQtyText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#5C0B0B'
  },
  medCardStepBtnPlus: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C0B0B',
    borderRadius: 4
  },
  medCardStepBtnPlusText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff'
  },
  medCardAddBtn: {
    marginTop: 6,
    backgroundColor: '#5C0B0B',
    paddingVertical: 5,
    borderRadius: 4,
    alignItems: 'center'
  },
  medCardAddBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold'
  },

  container: { flex: 1, backgroundColor: '#f4f6f9' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', margin: 20, marginTop: 40, color: '#3A0707' },
  section: { backgroundColor: '#fff', margin: 10, padding: 15, borderRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  patientItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  pName: { fontWeight: 'bold' },
  pPhone: { color: '#666' },
  selectedPatient: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: '#e3f2fd', borderRadius: 8 },
  medCard: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginRight: 10, borderWidth: 1, borderColor: '#dee2e6', width: 120 },
  medName: { fontWeight: 'bold', fontSize: 14 },
  medStock: { color: '#28a745', fontSize: 12, marginVertical: 5 },
  medPrice: { color: '#007bff', fontWeight: 'bold' },
  cartItemContainer: { borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10, width: '100%' },
  cartRow: { flexDirection: 'row', alignItems: 'center' },
  cartName: { fontWeight: 'bold', fontSize: 15 },
  cartQty: { color: '#666', fontSize: 12 },
  cartTotal: { fontWeight: 'bold', color: '#3A0707', fontSize: 16 },
  grandTotal: { textAlign: 'right', fontSize: 20, fontWeight: 'bold', marginTop: 15, color: '#28a745' },
  instructionInput: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 13, marginTop: 10 },
  presetScroll: { flexDirection: 'row', marginTop: 8 },
  presetChip: { backgroundColor: '#e3f2fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8, borderWidth: 1, borderColor: '#bbdefb' },
  presetText: { color: '#0d47a1', fontSize: 12, fontWeight: '500' },
  payBtn: { paddingVertical: 10, paddingHorizontal: 4, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, flex: 1, marginHorizontal: 3, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  checkoutBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center' },
  checkoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Decoupled Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  billModalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 400, elevation: 6 },
  successIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  modalSuccessTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center' },
  modalSubText: { fontSize: 13, color: '#666', marginTop: 2 },
  invoiceBadgeContainer: { marginTop: 6, backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  invoiceBadge: { fontSize: 14, fontWeight: 'bold', color: '#475569', letterSpacing: 0.5 },
  billSummaryBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  summaryLabel: { fontSize: 13, color: '#64748b', marginVertical: 2 },
  summaryVal: { color: '#1e293b', fontWeight: '600' },
  modalActionBtnPrimary: { backgroundColor: '#1d4ed8', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  modalActionBtnWhatsApp: { backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  modalActionBtnSecondary: { backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 8 },
  modalActionBtnDone: { backgroundColor: '#334155', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalActionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  modalActionBtnSecondaryText: { color: '#334155', fontWeight: 'bold', fontSize: 14 },
  modalActionBtnDoneText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  modalSecondaryBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  modalSecondaryBtnText: { color: '#666', fontSize: 13 },
  piranidDedicatedBox: { backgroundColor: '#fdf2f8', padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#fbcfe8', marginBottom: 12, marginTop: 4 },
  piranidDedicatedTitle: { fontSize: 14, fontWeight: 'bold', color: '#9d174d' },
  piranidDedicatedSubtitle: { fontSize: 12, color: '#701a75', marginBottom: 8 },
  piranidToggleRow: { flexDirection: 'row', gap: 8 },
  piranidToggleBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center' },
  piranidToggleBtnActiveFree: { backgroundColor: '#15803d', borderColor: '#15803d' },
  piranidToggleBtnActivePaid: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  piranidToggleText: { fontSize: 12, fontWeight: 'bold', color: '#475569', textAlign: 'center' },
  piranidToggleTextActive: { color: '#fff' },
  upiAccountBox: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 12 },
  upiAccountLabel: { fontSize: 12, fontWeight: 'bold', color: '#166534', marginBottom: 6 },
  upiAccountRow: { flexDirection: 'row', gap: 8 },
  upiAccountBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  upiAccountBtnActive: { backgroundColor: '#15803d', borderColor: '#15803d' },
  upiAccountBtnText: { fontSize: 11, fontWeight: 'bold', color: '#334155', textAlign: 'center' },
  upiAccountBtnTextActive: { color: '#fff' },
  splitBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 12 },
  splitBoxTitle: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  splitHalfBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#e0e7ff', borderRadius: 4 },
  splitHalfBtnText: { fontSize: 11, fontWeight: 'bold', color: '#3730a3' },
  splitInputLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 },
  splitInput: { borderWidth: 1.5, borderColor: '#10b981', fontSize: 16, fontWeight: 'bold', padding: 8, backgroundColor: '#fff', borderRadius: 6 },
  splitSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  splitSummaryText: { fontSize: 12, color: '#334155' }
});
