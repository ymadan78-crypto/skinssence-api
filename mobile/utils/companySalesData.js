// Precalculated and verified sales data for all Pharma Brands from Clinic Database
const salesDatabase = require('./precalculated_sales_data.json');

export function getCompanySales(targetMonth = 'ALL', targetCompany = 'ALL') {
  const { availableMonths, availableCompanies, grouped } = salesDatabase;

  const monthsToInclude = targetMonth === 'ALL' ? availableMonths : [targetMonth];
  const companiesToInclude = targetCompany === 'ALL' ? availableCompanies : [targetCompany];

  const resultCompanies = {};
  let overallUnits = 0;
  let overallMrpValue = 0;

  for (const m of monthsToInclude) {
    if (!grouped[m]) continue;
    for (const c of companiesToInclude) {
      if (!grouped[m][c]) continue;
      if (!resultCompanies[c]) {
        resultCompanies[c] = {
          company: c,
          totalUnits: 0,
          totalSalesMrp: 0,
          items: {}
        };
      }
      resultCompanies[c].totalUnits += grouped[m][c].totalUnits;
      resultCompanies[c].totalSalesMrp += grouped[m][c].totalSalesMrp;
      overallUnits += grouped[m][c].totalUnits;
      overallMrpValue += grouped[m][c].totalSalesMrp;

      for (const [iName, iObj] of Object.entries(grouped[m][c].items)) {
        if (!resultCompanies[c].items[iName]) {
          resultCompanies[c].items[iName] = {
            name: iName,
            mrp: iObj.mrp,
            qty: 0,
            totalAmount: 0
          };
        }
        resultCompanies[c].items[iName].qty += iObj.qty;
        resultCompanies[c].items[iName].totalAmount += iObj.totalAmount;
      }
    }
  }

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
    availableCompanies,
    summary: {
      totalUnits: overallUnits,
      totalSalesMrp: Math.round(overallMrpValue * 100) / 100,
      companiesCount: formattedCompanies.length
    },
    companies: formattedCompanies
  };
}
