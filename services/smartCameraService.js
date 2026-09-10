/**
 * Skinssence Smart Pharmacy Camera Service
 * - Multimodal / OCR image analysis
 * - Matches against 148-product Pharmacy Master
 * - FEFO (First Expiry First Out) auto-batch selection
 * - Patient auto-identification & candidate scoring
 * - Continuous learning from confirmed image references
 */

const https = require('https');

// Free Public OCR Endpoint Fallback (OCR.space Engine 2)
function extractTextWithOcrSpace(imageBase64) {
  if (!imageBase64) return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      const cleanB64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const postData = 'apikey=helloworld&isOverlayRequired=false&detectOrientation=true&scale=true&OCREngine=2&base64Image=' + encodeURIComponent('data:image/jpeg;base64,' + cleanB64);
      
      const req = https.request('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 18000
      }, (res) => {
        let buf = '';
        res.on('data', (c) => buf += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            const parsed = j.ParsedResults?.[0]?.ParsedText || '';
            resolve(parsed.trim());
          } catch (e) {
            resolve('');
          }
        });
      });

      req.on('error', (err) => {
        console.warn('[SmartCamera OCR] Fallback network notice:', err.message);
        resolve('');
      });

      req.on('timeout', () => {
        req.destroy();
        resolve('');
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.warn('[SmartCamera OCR] Exception:', err.message);
      resolve('');
    }
  });
}

// 1. Expiry Date Parser (FEFO helper)
function parseExpiryDate(expStr) {
  if (!expStr || typeof expStr !== 'string') return 99999999;
  const clean = expStr.trim();
  if (!clean) return 99999999;

  // Format: YYYY-MM-DD or YYYY-MM
  if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(clean)) {
    const parts = clean.split('-');
    const yr = parts[0];
    const mo = parts[1].padStart(2, '0');
    return parseInt(`${yr}${mo}01`, 10);
  }

  // Format: MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(clean)) {
    const [mo, yr] = clean.split('/');
    return parseInt(`${yr}${mo.padStart(2, '0')}01`, 10);
  }

  // Format: MM/YY
  if (/^\d{1,2}\/\d{2}$/.test(clean)) {
    const [mo, yr] = clean.split('/');
    const fullYr = parseInt(yr, 10) > 70 ? `19${yr}` : `20${yr}`;
    return parseInt(`${fullYr}${mo.padStart(2, '0')}01`, 10);
  }

  // Fallback: extract year and month numbers
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 6) { // e.g. 102028 or 202810
    if (parseInt(digits.slice(0, 4), 10) > 2000) return parseInt(digits + '01', 10);
    return parseInt(digits.slice(2) + digits.slice(0, 2) + '01', 10);
  } else if (digits.length === 4) { // e.g. 0427 -> 20270401
    return parseInt(`20${digits.slice(2)}${digits.slice(0, 2)}01`, 10);
  }

  return 99999999;
}

// Check if an expiry date is in the past (expired)
function isExpired(expStr) {
  if (!expStr || typeof expStr !== 'string' || !expStr.trim()) return false;
  const expVal = parseExpiryDate(expStr);
  const now = new Date();
  const currentMonthVal = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + 1;
  return expVal < currentMonthVal;
}

// 2. FEFO Batch Selection: Automatically selects earliest expiring batch with positive stock that is NOT expired
function selectBestBatchFEFO(batches) {
  if (!batches || batches.length === 0) return null;

  // Filter: MUST have quantity > 0 AND MUST NOT be expired for billing
  const validForBilling = batches.filter(b => {
    const hasStock = (b.quantity || 0) > 0;
    const notExpired = !isExpired(b.expiry_date);
    return hasStock && notExpired;
  });

  if (validForBilling.length === 0) {
    return {
      selectedBatch: null,
      availableBatches: [],
      isOutOfStockOrExpired: true
    };
  }

  // Sort by expiry date ascending (FEFO)
  const sorted = [...validForBilling].sort((a, b) => {
    const expA = parseExpiryDate(a.expiry_date);
    const expB = parseExpiryDate(b.expiry_date);
    if (expA !== expB) return expA - expB;
    // secondary sort: higher stock first
    return (b.quantity || 0) - (a.quantity || 0);
  });

  return {
    selectedBatch: sorted[0],
    availableBatches: sorted.map(b => ({
      id: b.id,
      batch_number: b.batch_number || 'N/A',
      expiry_date: b.expiry_date || 'N/A',
      quantity: b.quantity || 0,
      mrp: b.mrp || 0,
      is_early_expiry: b.id === sorted[0].id
    })),
    isOutOfStockOrExpired: false
  };
}

// 3. String Normalization & Levenshtein / Token Distance for Fuzzy Matching
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\function normalizeText(str) {');
}

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

function computeSimilarity(str1, str2) {
  const norm1 = normalizeText(str1);
  const norm2 = normalizeText(str2);

  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0;

  // Exact match or substring inclusion with spaces (require minLen >= 3 to avoid single-letter false matches)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const minLen = Math.min(norm1.length, norm2.length);
    const maxLen = Math.max(norm1.length, norm2.length);
    if (minLen < 3) return minLen / maxLen;
    return Math.max(0.85, minLen / maxLen);
  }

  // Spaceless comparison (e.g. "acne moist" -> "acnemoist" inside "acnemoistcream")
  const stripped1 = norm1.replace(/\s+/g, '');
  const stripped2 = norm2.replace(/\s+/g, '');
  if (stripped1 === stripped2) return 0.98;
  if (stripped1.includes(stripped2) || stripped2.includes(stripped1)) {
    const minLen = Math.min(stripped1.length, stripped2.length);
    const maxLen = Math.max(stripped1.length, stripped2.length);
    return Math.max(0.88, minLen / maxLen);
  }

  // Token overlap (Jaccard / Dice on words)
  const words1 = norm1.split(' ').filter(w => w.length > 1);
  const words2 = norm2.split(' ').filter(w => w.length > 1);
  const common = words1.filter(w => words2.includes(w));
  const tokenScore = common.length / Math.max(words1.length, words2.length, 1);

  // Character Levenshtein similarity on core brand name
  const core1 = words1[0] || norm1;
  const core2 = words2[0] || norm2;
  const maxLen = Math.max(core1.length, core2.length);
  const levDist = levenshteinDistance(core1, core2);
  const coreLevScore = 1 - levDist / Math.max(maxLen, 1);

  const spacelessLev = 1 - levenshteinDistance(stripped1, stripped2) / Math.max(stripped1.length, stripped2.length, 1);

  return Math.max(tokenScore * 0.9, coreLevScore * 0.85, spacelessLev * 0.85, (tokenScore + coreLevScore + spacelessLev) / 3);
}

// 4. Match Detected Text / Item against 148-Product Master
function matchProduct(detectedName, catalogueGrouped, learnedKeywords = []) {
  const normDetected = normalizeText(detectedName);

  // Check learned keywords first
  for (const lk of learnedKeywords) {
    if (lk.label_keywords && normDetected.includes(normalizeText(lk.label_keywords))) {
      const match = catalogueGrouped[lk.product_name];
      if (match) {
        return {
          product: match,
          confidence: 'HIGH',
          similarity: 0.98,
          matchedName: lk.product_name,
          learned: true
        };
      }
    }
  }

  let bestMatch = null;
  let highestScore = 0;

  for (const [prodName, prodData] of Object.entries(catalogueGrouped)) {
    const score = computeSimilarity(detectedName, prodName);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = { prodName, prodData };
    }
  }

  if (highestScore >= 0.72) {
    return {
      product: bestMatch.prodData,
      confidence: 'HIGH',
      similarity: highestScore,
      matchedName: bestMatch.prodName
    };
  } else if (highestScore >= 0.50) {
    return {
      product: bestMatch.prodData,
      confidence: 'MEDIUM',
      similarity: highestScore,
      matchedName: bestMatch.prodName
    };
  }

  return {
    product: null,
    confidence: 'LOW',
    similarity: highestScore,
    matchedName: null
  };
}

// 5. Patient Recognition & Search
function matchPatientFromText(detectedText, patientsList) {
  if (!detectedText || !patientsList || patientsList.length === 0) {
    return { matched: null, confidence: 'NONE', candidates: [] };
  }

  const normText = normalizeText(detectedText);
  const spacelessFullText = normText.replace(/\s+/g, '');

  // Look for explicit prefix: patient / pt / name / mr / ms / mrs
  const namePrefixRegex = /(?:patient|pt|name|mr|ms|mrs)\s*[:\-\s]\s*([^\n\r,;]+)/i;
  let extractedName = null;
  const matchPrefix = detectedText.match(namePrefixRegex);
  if (matchPrefix && matchPrefix[1]) {
    extractedName = normalizeText(matchPrefix[1]).slice(0, 40);
  }

  let bestPatient = null;
  let bestScore = 0;
  const candidates = [];

  for (const pt of patientsList) {
    const ptNameNorm = normalizeText(pt.name);
    if (!ptNameNorm || ptNameNorm.length < 3) continue;
    const ptCodeNorm = normalizeText(pt.patient_code || '');
    const ptPhone = (pt.phone || '').trim();

    // 1. Direct phone number match in text (100% confidence)
    if (ptPhone && ptPhone.length >= 7 && normText.includes(ptPhone)) {
      return {
        matched: pt,
        confidence: 'HIGH',
        candidates: [pt]
      };
    }

    // 2. Direct Patient Code match (e.g. S2858) (100% confidence)
    if (ptCodeNorm && ptCodeNorm.length >= 3 && normText.includes(ptCodeNorm)) {
      return {
        matched: pt,
        confidence: 'HIGH',
        candidates: [pt]
      };
    }

    // 3. Direct exact full patient name match in OCR text (98% confidence)
    const ptSpaceless = ptNameNorm.replace(/\s+/g, '');
    if (normText.includes(ptNameNorm) || (ptSpaceless.length >= 6 && spacelessFullText.includes(ptSpaceless))) {
      candidates.push({ ...pt, matchScore: 0.98 });
      if (0.98 > bestScore) {
        bestScore = 0.98;
        bestPatient = pt;
      }
      continue;
    }

    // 4. Multi-token match using word boundaries and fuzzy first-name prefix matching
    const ptWords = ptNameNorm.split(' ').filter(w => w.length >= 2 && w !== 'dr' && w !== 'mr' && w !== 'ms' && w !== 'mrs');
    if (ptWords.length >= 2) {
      let matchedWordCount = 0;
      let hasFuzzyFirst = false;

      for (let i = 0; i < ptWords.length; i++) {
        const w = ptWords[i];
        const wordRegex = new RegExp('\\b' + escapeRegex(w) + '\\b', 'i');
        if (wordRegex.test(normText)) {
          matchedWordCount++;
        } else if (i === 0 && extractedName) {
          // Check if first name matches extracted name fuzzily (e.g. "as pita" vs "arpita")
          const sim = computeSimilarity(extractedName.replace(/\s+/g, ''), w);
          if (sim >= 0.70) {
            hasFuzzyFirst = true;
            matchedWordCount++;
          }
        }
      }

      if (matchedWordCount === ptWords.length) {
        const tokenScore = hasFuzzyFirst ? 0.95 : 0.94;
        candidates.push({ ...pt, matchScore: tokenScore });
        if (tokenScore > bestScore) {
          bestScore = tokenScore;
          bestPatient = pt;
        }
        continue;
      }
    }

    // 5. If explicit "Name: XYZ" was captured, match against that extracted name
    if (extractedName) {
      const score = computeSimilarity(extractedName, ptNameNorm);
      if (score >= 0.65) {
        candidates.push({ ...pt, matchScore: score });
        if (score > bestScore) {
          bestScore = score;
          bestPatient = pt;
        }
      }
    }
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);

  if (bestScore >= 0.72) {
    return {
      matched: bestPatient,
      confidence: 'HIGH',
      candidates: candidates.slice(0, 3)
    };
  } else if (bestScore >= 0.58) {
    return {
      matched: bestPatient,
      confidence: 'MEDIUM',
      candidates: candidates.slice(0, 4)
    };
  }

  return {
    matched: null,
    confidence: 'NONE',
    candidates: []
  };
}

// 6. Gemini Vision AI Analyzer (Multimodal Recognition against Catalogue)
async function analyzeWithGemini(imageBase64, catalogueNames, recentPatients) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const axios = require('axios');
    const prompt = `You are an expert clinic pharmacy assistant at Skinssence Clinic.
Analyze this photo of pharmacy products/medicines handed over to a patient.
Known Clinic Product Catalogue (${catalogueNames.length} items):
${catalogueNames.join(', ')}

Known Recent Clinic Patients:
${recentPatients.slice(0, 50).map(p => `${p.name} (Code: ${p.patient_code || ''}, Phone: ${p.phone || ''})`).join(', ')}

Instructions:
1. Identify if a patient name or prescription slip is visible in the photo.
2. Identify all pharmacy products, creams, tubes, serums, tablets, shampoos visible in the image. Match each product against the Known Clinic Product Catalogue.
3. Detect unit count (quantity) for each product visible. If not clearly indicated, default to 1.
4. Extract any visible text (OCR).

Respond STRICTLY in JSON format without markdown wrapping:
{
  "patient_name_detected": "string or null",
  "patient_confidence": "HIGH" | "MEDIUM" | "LOW",
  "products": [
    {
      "detected_name": "exact catalogue name matched",
      "quantity": 1,
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "raw_text_seen": "text or label feature"
    }
  ],
  "raw_ocr_text": "all text extracted from photo"
}`;

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };

    const res = await axios.post(url, payload, { timeout: 15000 });
    const responseText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (responseText) {
      return JSON.parse(responseText);
    }
  } catch (err) {
    console.log('[Gemini Vision] API error or skipped:', err.message);
  }
  return null;
}

// 7. Master Analyzer Pipeline: Produces Verified Draft Bill
async function createDraftFromImage({
  imageBase64,
  rawText,
  inventoryRows,
  patientsList,
  learnedReferences = []
}) {
  // Group inventory rows by medicine_name to aggregate all batches
  const catalogueGrouped = {};
  inventoryRows.forEach(row => {
    const nameKey = (row.medicine_name || '').trim();
    if (!nameKey) return;
    if (!catalogueGrouped[nameKey]) {
      catalogueGrouped[nameKey] = {
        medicine_name: nameKey,
        default_instructions: row.default_instructions || '',
        mrp: row.mrp || 0,
        batches: []
      };
    }
    catalogueGrouped[nameKey].batches.push(row);
    if (!catalogueGrouped[nameKey].default_instructions && row.default_instructions) {
      catalogueGrouped[nameKey].default_instructions = row.default_instructions;
    }
    if (!catalogueGrouped[nameKey].mrp && row.mrp) {
      catalogueGrouped[nameKey].mrp = row.mrp;
    }
  });

  const catalogueNames = Object.keys(catalogueGrouped);

  // 1. Attempt Gemini Vision first if image provided and key configured
  let visionResult = null;
  if (imageBase64 && process.env.GEMINI_API_KEY) {
    visionResult = await analyzeWithGemini(imageBase64, catalogueNames, patientsList);
  }

  // 2. High-accuracy Zero-Config OCR Fallback (OCR.space free engine 2)
  let extractedOcrText = visionResult?.raw_ocr_text || rawText || '';
  if (!extractedOcrText && imageBase64) {
    try {
      extractedOcrText = await extractTextWithOcrSpace(imageBase64);
    } catch (errOcr) {
      console.warn('[SmartCamera] OCR fallback warning:', errOcr.message);
    }
  }

  // Patient Identification
  let patientMatch = null;
  if (visionResult?.patient_name_detected) {
    patientMatch = matchPatientFromText(visionResult.patient_name_detected, patientsList);
    if (patientMatch.matched) {
      patientMatch.confidence = visionResult.patient_confidence || patientMatch.confidence;
    }
  } else {
    patientMatch = matchPatientFromText(extractedOcrText, patientsList);
  }

  // Product Matching
  const draftItems = [];
  const unmatchedDetections = [];

  const rawCandidateProducts = visionResult?.products || [];

  // If no Gemini vision result, parse candidate product names from raw text lines
  if (rawCandidateProducts.length === 0 && extractedOcrText) {
    const lines = extractedOcrText.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length > 2);
    lines.forEach(line => {
      // Check for quantity notation like "Product x 2" or "2 x Product"
      let qty = 1;
      let cleanLine = line;
      const qtyMatch1 = line.match(/(.+?)\s*[xX*]\s*(\d+)/);
      const qtyMatch2 = line.match(/^(\d+)\s*[xX*]\s*(.+)/);
      if (qtyMatch1) {
        cleanLine = qtyMatch1[1].trim();
        qty = parseInt(qtyMatch1[2], 10) || 1;
      } else if (qtyMatch2) {
        cleanLine = qtyMatch2[2].trim();
        qty = parseInt(qtyMatch2[1], 10) || 1;
      }
      rawCandidateProducts.push({
        detected_name: cleanLine,
        quantity: Math.max(1, qty),
        confidence: 'MEDIUM',
        raw_text_seen: line
      });
    });
  }

  // Match each candidate against 148 product catalogue with FEFO batch selection
  const outOfStockItems = [];

  for (const cand of rawCandidateProducts) {
    const matchRes = matchProduct(cand.detected_name, catalogueGrouped, learnedReferences);

    if (matchRes.product) {
      const prod = matchRes.product;
      const batchResult = selectBestBatchFEFO(prod.batches);
      const selBatch = batchResult?.selectedBatch;

      // REMOVE EXPIRED AND ZERO QUANTITY ITEMS FROM BILLING:
      // Product remains recognized for fast AI learning, but cannot be billed
      if (!selBatch || batchResult?.isOutOfStockOrExpired) {
        const hasAnyQty = prod.batches.some(b => (b.quantity || 0) > 0);
        outOfStockItems.push({
          product_name: prod.medicine_name,
          raw_detected_name: cand.detected_name,
          reason: hasAnyQty ? 'EXPIRED' : 'ZERO_QUANTITY'
        });
        continue;
      }

      const unitPrice = selBatch?.mrp || prod.mrp || 0;
      const qty = Math.max(1, cand.quantity || 1);
      const defaultInstr = prod.default_instructions 
        ? prod.default_instructions.split(',')[0].trim() 
        : (prod.medicine_name.toLowerCase().includes('piranid') ? 'Apply twice daily post-procedure' : '');

      // Avoid duplicate item row in draft: if already in draft, increment quantity
      const existingDraftItem = draftItems.find(it => it.medicine_name.toLowerCase() === prod.medicine_name.toLowerCase());
      if (existingDraftItem) {
        existingDraftItem.quantity += qty;
        existingDraftItem.amount = existingDraftItem.quantity * existingDraftItem.mrp;
      } else {
        draftItems.push({
          inventory_id: selBatch?.id || prod.batches[0]?.id,
          medicine_name: prod.medicine_name,
          quantity: qty,
          mrp: unitPrice,
          amount: unitPrice * qty,
          batch_number: selBatch?.batch_number || 'N/A',
          expiry_date: selBatch?.expiry_date || 'N/A',
          is_early_expiry: true,
          available_batches: batchResult?.availableBatches || [],
          default_instructions: defaultInstr,
          instruction: defaultInstr,
          confidence: matchRes.confidence,
          similarity: Math.round((matchRes.similarity || 0.8) * 100)
        });
      }
    } else {
      unmatchedDetections.push({
        raw_detected_name: cand.detected_name,
        quantity: cand.quantity || 1
      });
    }
  }

  // Catalogue Brand Full-Text Scan Fallback
  // If items are wrapped or multi-line in OCR, scan full text for all 148 catalogue items
  if (extractedOcrText) {
    const normFullText = normalizeText(extractedOcrText);
    const spacelessFullText = normFullText.replace(/\s+/g, '');

    for (const prodName of catalogueNames) {
      const alreadyDrafted = draftItems.some(it => it.medicine_name.toLowerCase() === prodName.toLowerCase());
      if (alreadyDrafted) continue;

      const normPName = normalizeText(prodName);
      if (!normPName || normPName.length < 4) continue;
      const spacelessPName = normPName.replace(/\s+/g, '');
      const words = normPName.split(' ').filter(w => w.length > 3);
      const brandWord = words[0];

      // Exclude generic packaging words from triggering brand scan
      const genericWords = ['cream', 'gel', 'lotion', 'tablet', 'serum', 'shampoo', 'wash', 'face', 'mask', 'plus'];
      const isGenericBrand = genericWords.includes(brandWord);

      let isMatch = false;
      if (normFullText.includes(normPName) || (spacelessPName.length >= 6 && spacelessFullText.includes(spacelessPName))) {
        isMatch = true;
      } else if (!isGenericBrand && brandWord && brandWord.length >= 5 && (normFullText.includes(brandWord) || spacelessFullText.includes(brandWord))) {
        isMatch = true;
      }

      if (isMatch) {
        const prod = catalogueGrouped[prodName];
        const batchResult = selectBestBatchFEFO(prod.batches);
        const selBatch = batchResult?.selectedBatch;

        if (!selBatch || batchResult?.isOutOfStockOrExpired) {
          const hasAnyQty = prod.batches.some(b => (b.quantity || 0) > 0);
          if (!outOfStockItems.some(o => o.product_name.toLowerCase() === prod.medicine_name.toLowerCase())) {
            outOfStockItems.push({
              product_name: prod.medicine_name,
              raw_detected_name: prod.medicine_name,
              reason: hasAnyQty ? 'EXPIRED' : 'ZERO_QUANTITY'
            });
          }
          continue;
        }

        const unitPrice = selBatch?.mrp || prod.mrp || 0;
        const defaultInstr = prod.default_instructions 
          ? prod.default_instructions.split(',')[0].trim() 
          : (prod.medicine_name.toLowerCase().includes('piranid') ? 'Apply twice daily post-procedure' : '');

        draftItems.push({
          inventory_id: selBatch?.id || prod.batches[0]?.id,
          medicine_name: prod.medicine_name,
          quantity: 1,
          mrp: unitPrice,
          amount: unitPrice,
          batch_number: selBatch?.batch_number || 'N/A',
          expiry_date: selBatch?.expiry_date || 'N/A',
          is_early_expiry: true,
          available_batches: batchResult?.availableBatches || [],
          default_instructions: defaultInstr,
          instruction: defaultInstr,
          confidence: 'HIGH',
          similarity: 95
        });
      }
    }
  }

  const subtotal = draftItems.reduce((sum, it) => sum + (it.amount || 0), 0);

  return {
    patient: patientMatch?.matched ? {
      id: patientMatch.matched.id,
      name: patientMatch.matched.name,
      phone: patientMatch.matched.phone,
      patient_code: patientMatch.matched.patient_code,
      confidence: patientMatch.confidence
    } : null,
    patient_candidates: patientMatch?.candidates || [],
    items: draftItems,
    unmatched_items: unmatchedDetections,
    out_of_stock_items: outOfStockItems,
    subtotal: subtotal,
    raw_ocr_text: extractedOcrText
  };
}

module.exports = {
  extractTextWithOcrSpace,
  parseExpiryDate,
  isExpired,
  selectBestBatchFEFO,
  computeSimilarity,
  matchProduct,
  matchPatientFromText,
  createDraftFromImage
};
