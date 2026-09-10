with open('mobile/utils/header_banner.js', 'r') as f:
    banner_js = f.read()
banner_b64 = banner_js.split('"')[1]

# 1. Update PatientProfileScreen.js
with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    pp = f.read()

# Replace LOGO_BASE64 definition with HEADER_BANNER_BASE64
if 'const HEADER_BANNER_BASE64' not in pp:
    pp = pp.replace('const LOGO_BASE64 = ', f'const HEADER_BANNER_BASE64 = "{banner_b64}";\nconst LOGO_BASE64 = ')

# In printReceipt, update the header HTML
old_header = """          <div class="header-container">
            <img src="${LOGO_BASE64}" style="width:80px;height:80px;object-fit:contain;flex-shrink:0;" />
            <div class="clinic-details">
              <h1>SKINSSENCE LASER AND SKINCARE CLINIC</h1>
              <p class="doc">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</p>
              <p class="addr">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
              <p class="addr">📞 095091 97578 &nbsp;&nbsp;🌐 www.skinssence.in</p>
            </div>
            <div class="bill-type">RECEIPT / INVOICE</div>
          </div>"""

new_header = """          <div class="header-container">
            <div style="flex: 1;">
              <img src="${HEADER_BANNER_BASE64}" style="max-height:85px;max-width:350px;object-fit:contain;" />
              <p class="doc" style="margin-top:6px;font-weight:bold;color:#222;font-size:14px;">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</p>
              <p class="addr" style="font-size:12px;color:#555;margin:2px 0;">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
              <p class="addr" style="font-size:12px;color:#555;margin:2px 0;">📞 095091 97578 &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.skinssence.in</p>
            </div>
            <div class="bill-type" style="font-size:16px;font-weight:bold;color:#5C0B0B;text-align:right;border:2px solid #5C0B0B;padding:6px 12px;border-radius:5px;align-self:center;">RECEIPT / INVOICE</div>
          </div>"""

if old_header in pp:
    pp = pp.replace(old_header, new_header)

# Ensure doctor is ALWAYS Dr. Ashima Madan
pp = pp.replace('<div><span class="info-label">Doctor: </span><span class="info-value">Dr. ${visit.doctor_name}</span></div>',
                '<div><span class="info-label">Doctor: </span><span class="info-value">Dr. Ashima Madan</span></div>')

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(pp)
print("PatientProfileScreen.js updated!")

# 2. Update PharmacyBillingScreen.js
with open('mobile/screens/PharmacyBillingScreen.js', 'r', encoding='utf-8') as f:
    pb = f.read()

if 'const HEADER_BANNER_BASE64' not in pb:
    pb = pb.replace('const LOGO_BASE64 = ', f'const HEADER_BANNER_BASE64 = "{banner_b64}";\nconst LOGO_BASE64 = ')

old_pb_header = """          <div class="header-container">
            <img src="${LOGO_BASE64}" style="width:75px;height:75px;object-fit:contain;flex-shrink:0;" />
            <div class="header-text">
              <h1>SKINSSENCE LASER AND SKINCARE CLINIC</h1>
              <h2>Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</h2>
              <h2>4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</h2>
              <h2>📞 095091 97578 &nbsp;|&nbsp; 🌐 www.skinssence.in</h2>
            </div>
            <div>
              <h3>PHARMACY BILL</h3>
            </div>
          </div>"""

new_pb_header = """          <div class="header-container">
            <div style="flex: 1;">
              <img src="${HEADER_BANNER_BASE64}" style="max-height:85px;max-width:350px;object-fit:contain;" />
              <h2 style="color:#222;font-size:14px;font-weight:bold;margin:6px 0 2px 0;">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</h2>
              <h2 style="color:#555;font-size:12px;margin:2px 0;">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</h2>
              <h2 style="color:#555;font-size:12px;margin:2px 0;">📞 095091 97578 &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.skinssence.in</h2>
            </div>
            <div>
              <h3 style="color:#5C0B0B;border:2px solid #5C0B0B;padding:6px 12px;border-radius:5px;">PHARMACY BILL</h3>
            </div>
          </div>"""

if old_pb_header in pb:
    pb = pb.replace(old_pb_header, new_pb_header)

old_pb_table = """          <table class="info-table">
            <tr>
              <td class="info-label">Patient Name:</td>
              <td>${selectedPatient.first_name} ${selectedPatient.last_name || ''}</td>
              <td class="info-label">Invoice Date:</td>
              <td>${dateStr}</td>
            </tr>
            <tr>
              <td class="info-label">Mobile:</td>
              <td>${selectedPatient.mobile}</td>
              <td class="info-label">Invoice No:</td>
              <td>#INV-${invoiceId || Math.floor(Math.random()*10000)}</td>
            </tr>
            <tr>
              <td class="info-label">Payment Mode:</td>
              <td colspan="3">${payload.payment_mode}</td>
            </tr>
          </table>"""

new_pb_table = """          <table class="info-table">
            <tr>
              <td class="info-label">Patient Name:</td>
              <td>${selectedPatient.first_name} ${selectedPatient.last_name || ''}</td>
              <td class="info-label">Invoice Date:</td>
              <td>${dateStr}</td>
            </tr>
            <tr>
              <td class="info-label">Mobile:</td>
              <td>${selectedPatient.mobile}</td>
              <td class="info-label">Invoice No:</td>
              <td>#INV-${invoiceId || Math.floor(Math.random()*10000)}</td>
            </tr>
            <tr>
              <td class="info-label">Doctor:</td>
              <td>Dr. Ashima Madan</td>
              <td class="info-label">Payment Mode:</td>
              <td>${payload.payment_mode}</td>
            </tr>
          </table>"""

if old_pb_table in pb:
    pb = pb.replace(old_pb_table, new_pb_table)

with open('mobile/screens/PharmacyBillingScreen.js', 'w', encoding='utf-8') as f:
    f.write(pb)
print("PharmacyBillingScreen.js updated!")
