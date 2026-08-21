export const VAT_RATE = 0.18;

export const FEE_ROWS = Object.freeze([
  { key: "planning", label: "דמי תכנון", rate: 0.074 },
  { key: "management", label: "דמי תפעול וניהול", rate: 0.054 },
  { key: "supervision", label: "דמי פיקוח", rate: 0.027 },
]);

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function moneyToCents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

function rateToBasisPoints(rate) {
  return Math.round(Number(rate) * 10_000);
}

function moneyAtRate(value, rate) {
  const cents = moneyToCents(value);
  const basisPoints = rateToBasisPoints(rate);
  return Math.round((cents * basisPoints) / 10_000) / 100;
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
  const vat = moneyAtRate(subtotalNet, VAT_RATE);
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
    const existingRemainder = primary.find((group) => group.category === "עבודות משלימות");
    if (existingRemainder) {
      existingRemainder.net = roundMoney(existingRemainder.net + remainderNet);
      existingRemainder.sourceRows.push(...remainderRows);
      result = primary;
    } else {
      result = [...primary, { category: "עבודות משלימות", net: remainderNet, sourceRows: remainderRows }];
    }
  }

  const allocatedVat = allocateVatByLargestRemainder(result, calculated.vat);
  return result.map((group, index) => {
    const vat = allocatedVat[index];
    return {
      ...group,
      serialNumber: index + 1,
      vat,
      totalWithVat: roundMoney(group.net + vat),
    };
  });
}

function allocateVatByLargestRemainder(groups, totalVat) {
  const targetCents = moneyToCents(totalVat);
  const vatBasisPoints = rateToBasisPoints(VAT_RATE);
  const allocations = groups.map((group, index) => {
    const rawAgoraBasisPoints = moneyToCents(group.net) * vatBasisPoints;
    const baseCents = Math.floor(rawAgoraBasisPoints / 10_000);
    return { index, baseCents, remainder: rawAgoraBasisPoints % 10_000 };
  });
  let remaining = targetCents - allocations.reduce((sum, item) => sum + item.baseCents, 0);
  const order = [...allocations].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) order[index % order.length].baseCents += 1;
  return allocations.sort((left, right) => left.index - right.index).map((item) => item.baseCents / 100);
}

export function calculateProjectSummary(rows) {
  const boq = calculateBoq(rows);
  const groups = groupEstimate(rows);
  const fees = FEE_ROWS.map((fee) => ({
    ...fee,
    amount: moneyAtRate(boq.totalWithVat, fee.rate),
  }));
  const feesTotal = roundMoney(fees.reduce((total, fee) => total + fee.amount, 0));
  const grandTotal = roundMoney(boq.totalWithVat + feesTotal);
  const audit = buildFinancialAudit({ boq, groups, fees, feesTotal, grandTotal });
  if (!audit.valid) throw new Error(`Financial audit failed: ${audit.failedChecks.join(", ")}`);

  return { boq, groups, fees, feesTotal, grandTotal, audit };
}

function buildFinancialAudit({ boq, groups, fees, feesTotal, grandTotal }) {
  const checks = {
    rowAmountsEqualNet: roundMoney(boq.rows.reduce((sum, row) => sum + row.amount, 0)) === boq.subtotalNet,
    vatIsExactly18Percent: moneyAtRate(boq.subtotalNet, VAT_RATE) === boq.vat,
    grossEqualsNetPlusVat: roundMoney(boq.subtotalNet + boq.vat) === boq.totalWithVat,
    estimateNetEqualsBoqNet: roundMoney(groups.reduce((sum, group) => sum + group.net, 0)) === boq.subtotalNet,
    estimateVatEqualsBoqVat: roundMoney(groups.reduce((sum, group) => sum + group.vat, 0)) === boq.vat,
    estimateGrossEqualsBoqGross: roundMoney(groups.reduce((sum, group) => sum + group.totalWithVat, 0)) === boq.totalWithVat,
    feesUseVatInclusiveBase: fees.every((fee) => fee.amount === moneyAtRate(boq.totalWithVat, fee.rate)),
    feesTotalMatches: roundMoney(fees.reduce((sum, fee) => sum + fee.amount, 0)) === feesTotal,
    grandTotalMatches: roundMoney(boq.totalWithVat + feesTotal) === grandTotal,
    onlyApprovedFees: fees.length === FEE_ROWS.length && fees.every((fee, index) => fee.key === FEE_ROWS[index].key && fee.rate === FEE_ROWS[index].rate),
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { valid: failedChecks.length === 0, checks, failedChecks, difference: 0 };
}
