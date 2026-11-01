// Precalculated and verified sales data for all Pharma Brands from Clinic Database
const salesDatabase = require('./precalculated_sales_data.json');

export function getCompanySales(targetMonth = 'ALL', targetCompany = 'ALL', brandOverrides = {}) {
  const { availableMonths, availableCompanies, grouped } = salesDatabase;

  const monthsToInclude = targetMonth === 'ALL' ? availableMonths : [targetMonth];

  const resultCompanies = {};
  let overallUnits = 0;
  let overallMrpValue = 0;
  const dynamicallyFoundCompanies = new Set();

  for (const m of monthsToInclude) {
    if (!grouped[m]) continue;

    for (const originalComp of Object.keys(grouped[m])) {
      const compGroup = grouped[m][originalComp];
      if (!compGroup || !compGroup.items) continue;

      for (const [iName, iObj] of Object.entries(compGroup.items)) {
        const lowerName = (iName || '').trim().toLowerCase();
        const effectiveComp = (brandOverrides && brandOverrides[lowerName])
          ? brandOverrides[lowerName].trim()
          : originalComp;

        dynamicallyFoundCompanies.add(effectiveComp);

        if (targetCompany !== 'ALL' && effectiveComp !== targetCompany) {
          continue;
        }

        if (!resultCompanies[effectiveComp]) {
          resultCompanies[effectiveComp] = {
            company: effectiveComp,
            totalUnits: 0,
            totalSalesMrp: 0,
            items: {}
          };
        }

        const itemTotal = (iObj.qty || 0) * (iObj.mrp || 0);
        resultCompanies[effectiveComp].totalUnits += (iObj.qty || 0);
        resultCompanies[effectiveComp].totalSalesMrp += itemTotal;
        overallUnits += (iObj.qty || 0);
        overallMrpValue += itemTotal;

        if (!resultCompanies[effectiveComp].items[iName]) {
          resultCompanies[effectiveComp].items[iName] = {
            name: iName,
            mrp: iObj.mrp,
            qty: 0,
            totalAmount: 0
          };
        }
        resultCompanies[effectiveComp].items[iName].qty += (iObj.qty || 0);
        resultCompanies[effectiveComp].items[iName].totalAmount += itemTotal;
      }
    }
  }

  const allAvailableCompanies = Array.from(new Set([...availableCompanies, ...dynamicallyFoundCompanies])).sort((a, b) => {
    if (a === 'Velnourish') return -1;
    if (b === 'Velnourish') return 1;
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  const formattedCompanies = Object.values(resultCompanies).map(c => ({
    company: c.company,
    totalUnits: c.totalUnits,
    totalSalesMrp: Math.round(c.totalSalesMrp * 100) / 100,
    items: Object.values(c.items)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(it => ({
        name: it.name,
        mrp: it.mrp,
        qty: it.qty,
        totalAmount: Math.round(it.totalAmount * 100) / 100
      }))
  })).sort((a, b) => {
    if (a.company === 'Velnourish') return -1;
    if (b.company === 'Velnourish') return 1;
    return b.totalSalesMrp - a.totalSalesMrp;
  });

  return {
    selectedMonth: targetMonth,
    selectedCompany: targetCompany,
    availableMonths,
    availableCompanies: allAvailableCompanies,
    summary: {
      totalUnits: overallUnits,
      totalSalesMrp: Math.round(overallMrpValue * 100) / 100,
      companiesCount: formattedCompanies.length
    },
    companies: formattedCompanies
  };
}
