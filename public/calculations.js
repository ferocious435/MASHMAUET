export const VAT_RATE = 0.18;

export const FEE_ROWS = Object.freeze([
  { key: "planning", label: "דמי תכנון", rate: 0.074 },
  { key: "management", label: "דמי תפעול וניהול", rate: 0.054 },
  { key: "supervision", label: "דמי פיקוח", rate: 0.027 },
]);

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateBoq(rows) {
  const normalizedRows = rows.map((row) => {
    const quantity = Math.max(0, Number(row.quantity) || 0);
    const unitPrice = Math.max(0, Number(row.unitPrice) || 0);
    return {
      ...row,
      quantity,
      unitPrice,
      amount: roundMoney(quantity * unitPrice),
    };
  });
  const subtotalNet = roundMoney(
    normalizedRows.reduce((total, row) => total + row.amount, 0),
  );
  const vat = roundMoney(subtotalNet * VAT_RATE);
  const totalWithVat = roundMoney(subtotalNet + vat);

  return { rows: normalizedRows, subtotalNet, vat, totalWithVat };
}

export function groupEstimate(rows) {
  const calculated = calculateBoq(rows);
  const groups = new Map();

  for (const row of calculated.rows) {
    const category = String(row.category || "עבודות כלליות").trim();
    const current = groups.get(category) || { category, net: 0, sourceRows: [] };
    current.net = roundMoney(current.net + row.amount);
    current.sourceRows.push(row);
    groups.set(category, current);
  }

  let result = [...groups.values()].sort((a, b) => b.net - a.net);
  if (result.length > 5) {
    const primary = result.slice(0, 4);
    const remainderRows = result.slice(4).flatMap((group) => group.sourceRows);
    const remainderNet = roundMoney(
      result.slice(4).reduce((total, group) => total + group.net, 0),
    );
    result = [
      ...primary,
      { category: "עבודות משלימות", net: remainderNet, sourceRows: remainderRows },
    ];
  }

  return result.map((group, index) => ({
    ...group,
    serialNumber: index + 1,
    vat: roundMoney(group.net * VAT_RATE),
    totalWithVat: roundMoney(group.net * (1 + VAT_RATE)),
  }));
}

export function calculateProjectSummary(rows) {
  const boq = calculateBoq(rows);
  const fees = FEE_ROWS.map((fee) => ({
    ...fee,
    amount: roundMoney(boq.totalWithVat * fee.rate),
  }));
  const feesTotal = roundMoney(fees.reduce((total, fee) => total + fee.amount, 0));
  const grandTotal = roundMoney(boq.totalWithVat + feesTotal);

  return { boq, groups: groupEstimate(rows), fees, feesTotal, grandTotal };
}
