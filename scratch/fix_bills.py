import re

# Read the base64 logo
with open('mobile/utils/logo.js', 'r') as f:
    logo_js = f.read()
# Extract just the base64 data URI
logo_b64 = logo_js.split('"')[1]  # data:image/png;base64,...

# ============================================================
# Update PatientProfileScreen.js
# ============================================================
with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add axios import is already there.
# 2. Update the printReceipt function to:
#    a) Save invoice to DB first, get invoice number
#    b) Use real logo in PDF
#    c) Add Preview vs Send choice

# Add LOGO_BASE64 import after existing imports
if 'LOGO_BASE64' not in code:
    code = code.replace(
        "import * as Sharing from 'expo-sharing';",
        f"import * as Sharing from 'expo-sharing';\n\nconst LOGO_BASE64 = '{logo_b64}';"
    )

# Replace the logo placeholder circle in the PDF HTML with real image
old_logo_circle = """          <div style="width:70px;height:70px;background:#5C0B0B;border-radius:35px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:white;font-size:28px;font-weight:bold;font-family:serif;">S</span>
            </div>"""

new_logo_img = '          <img src="${LOGO_BASE64}" style="width:80px;height:80px;object-fit:contain;flex-shrink:0;" />'

code = code.replace(old_logo_circle, new_logo_img)

# Now wrap the printReceipt to also save invoice and offer Preview vs Send
# Find the try/catch that generates and shares the PDF
old_try = """    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate PDF.');
    }
  };"""

new_try = """    try {
      // 1. Save invoice to database first to get invoice number
      const token = await AsyncStorage.getItem('userToken');
      const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
      const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
      const grandTotal = procTotal + medTotal;
      const payMode = (visit.payments || []).map(p => p.mode).join('/') || 'N/A';
      
      let savedInvoiceNumber = invoiceNo;
      try {
        const invRes = await axios.post('https://skinssence-api.onrender.com/api/invoices', {
          patient_id: patient.id,
          visit_id: visit.visit_id,
          items_json: [...(visit.procedures||[]).map(p => ({name:p.name, qty:1, amount:p.amount})), ...(visit.medicines||[]).map(m => ({name:m.details, qty:1, amount:m.amount}))],
          subtotal: grandTotal,
          discount: 0,
          grand_total: grandTotal,
          payment_mode: payMode,
          amount_paid: grandTotal
        }, { headers: { Authorization: `Bearer ${token}` } });
        savedInvoiceNumber = invRes.data.invoice_number;
      } catch (invErr) {
        console.log('Invoice save failed (non-fatal):', invErr.message);
      }
      
      // Re-generate HTML with the real invoice number
      const finalHtml = htmlContent.replace(invoiceNo, savedInvoiceNumber);
      
      // 2. Generate PDF
      const { uri } = await Print.printToFileAsync({ html: finalHtml });
      
      // 3. Offer Preview vs Share
      Alert.alert(
        'Bill Ready — ' + savedInvoiceNumber,
        'What would you like to do?',
        [
          {
            text: 'Preview',
            onPress: async () => {
              await Sharing.shareAsync(uri, { dialogTitle: 'Preview Bill — ' + savedInvoiceNumber });
            }
          },
          {
            text: 'Share / Send',
            onPress: () => Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' })
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate PDF.');
    }
  };"""

code = code.replace(old_try, new_try)

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("PatientProfileScreen updated!")

# ============================================================
# Update PharmacyBillingScreen.js
# ============================================================
with open('mobile/screens/PharmacyBillingScreen.js', 'r', encoding='utf-8') as f:
    code2 = f.read()

if 'LOGO_BASE64' not in code2:
    code2 = code2.replace(
        "import * as Sharing from 'expo-sharing';",
        f"import * as Sharing from 'expo-sharing';\n\nconst LOGO_BASE64 = '{logo_b64}';"
    )

# Replace logo circle placeholder in pharmacy bill HTML
old_pharma_logo = """          <div style="width:70px;height:70px;background:#5C0B0B;border-radius:40px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:white;font-size:32px;font-weight:bold;">S</span>
            </div>"""

new_pharma_logo = '          <img src="${LOGO_BASE64}" style="width:75px;height:75px;object-fit:contain;flex-shrink:0;" />'

code2 = code2.replace(old_pharma_logo, new_pharma_logo)

# Now update the Print.printToFileAsync block in PharmacyBillingScreen to:
# 1. Save invoice to DB
# 2. Show Preview vs Share choice (not auto-share)
old_pharma_try = """    try {
      const { uri } = await Print.printToFileAsync({ html });
      
      // View Bill Option
      Alert.alert(
        'Bill Generated',
        'Sale was successful! What would you like to do with the bill?',
        [
          { 
            text: 'Preview Bill', 
            onPress: async () => {
              try {
                // View PDF natively on Android using IntentLauncher or sharing
                await Sharing.shareAsync(uri, { dialogTitle: 'Preview Bill' });
                askWhatsApp(payload, uri);
              } catch (err) {
                 askWhatsApp(payload, uri);
              }
            }
          },
          { 
            text: 'Share / Send', 
            onPress: () => askWhatsApp(payload, uri)
          }
        ]
      );
      
    } catch (e) {
      Alert.alert('Error', 'Failed to generate PDF');
    }"""

new_pharma_try = """    try {
      // Save invoice to DB
      const token = await AsyncStorage.getItem('userToken');
      let invoiceNumber = 'SKN-PHARM';
      try {
        const invRes = await axios.post('https://skinssence-api.onrender.com/api/invoices', {
          patient_id: payload.patient_id,
          visit_id: res.data.visit_id,
          items_json: payload.medicines_sold.map(m => ({ name: m.medicine_name, qty: m.quantity, amount: m.amount, instruction: m.instruction, batch: m.batch_number })),
          subtotal: payload.amount_received,
          discount: 0,
          grand_total: payload.amount_received,
          payment_mode: payload.payment_mode,
          amount_paid: payload.amount_received
        }, { headers: { Authorization: `Bearer ${token}` } });
        invoiceNumber = invRes.data.invoice_number;
      } catch (invErr) {
        console.log('Invoice save failed (non-fatal):', invErr.message);
      }
      
      const finalHtml = html.replace('#INV-' + (res.data.visit_id || ''), invoiceNumber);
      const { uri } = await Print.printToFileAsync({ html: finalHtml });
      
      Alert.alert(
        '✅ Sale Complete — ' + invoiceNumber,
        'What would you like to do with the bill?',
        [
          { 
            text: '👁️ Preview',
            onPress: async () => {
              await Sharing.shareAsync(uri, { dialogTitle: invoiceNumber });
            }
          },
          { 
            text: '📤 Share / Send', 
            onPress: () => askWhatsApp(payload, uri, invoiceNumber)
          },
          { text: 'Close', style: 'cancel' }
        ]
      );
      
    } catch (e) {
      console.log(e);
      Alert.alert('Error', 'Failed to generate PDF');
    }"""

code2 = code2.replace(old_pharma_try, new_pharma_try)

# Also update askWhatsApp to accept invoice number
old_ask = "  const askWhatsApp = (payload, uri) => {"
new_ask = "  const askWhatsApp = (payload, uri, invoiceNumber) => {"
code2 = code2.replace(old_ask, new_ask, 1)

with open('mobile/screens/PharmacyBillingScreen.js', 'w', encoding='utf-8') as f:
    f.write(code2)

print("PharmacyBillingScreen updated!")
