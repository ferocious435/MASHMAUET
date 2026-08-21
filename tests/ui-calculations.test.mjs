import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBoq,
  calculateProjectSummary,
  groupEstimate,
} from "../public/calculations.js";

const rows = [
  {
    code: "01",
    description: "עבודה א",
    unit: "יח׳",
    quantity: 2,
    unitPrice: 50,
    category: "עבודות הכנה",
  },
  {
    code: "02",
    description: "עבודה ב",
    unit: "יח׳",
    quantity: 1,
    unitPrice: 200,
    category: "עבודות גמר",
  },
];

test("כתב כמויות keeps rows net and adds 18% VAT only in totals", () => {
  const result = calculateBoq(rows);

  assert.deepEqual(
    result.rows.map((row) => row.amount),
    [100, 200],
  );
  assert.equal(result.subtotalNet, 300);
  assert.equal(result.vat, 54);
  assert.equal(result.totalWithVat, 354);
});

test("פירוט האומדן groups source rows and reconciles to BOQ including VAT", () => {
  const groups = groupEstimate(rows);

  assert.equal(groups.length, 2);
  assert.equal(
    groups.reduce((total, group) => total + group.totalWithVat, 0),
    354,
  );
  assert.equal(groups.flatMap((group) => group.sourceRows).length, rows.length);
});

test("planning, management and supervision fees use the VAT-inclusive base", () => {
  const summary = calculateProjectSummary(rows);

  assert.equal(summary.fees.find((fee) => fee.key === "planning").amount, 26.2);
  assert.equal(summary.fees.find((fee) => fee.key === "management").amount, 19.12);
  assert.equal(summary.fees.find((fee) => fee.key === "supervision").amount, 9.56);
  assert.equal(summary.grandTotal, 408.88);
  assert.equal(summary.audit.valid, true);
  assert.ok(Object.values(summary.audit.checks).every(Boolean));
});

test("more than five categories are reduced to five estimate rows", () => {
  const manyRows = Array.from({ length: 7 }, (_, index) => ({
    code: String(index),
    description: `row ${index}`,
    unit: "unit",
    quantity: 1,
    unitPrice: 10 + index,
    category: `category ${index}`,
  }));
  const groups = groupEstimate(manyRows);

  assert.equal(groups.length, 5);
  assert.equal(
    groups.reduce((total, group) => total + group.net, 0),
    calculateBoq(manyRows).subtotalNet,
  );
});

test("VAT allocation across estimate groups never drifts by one agora", () => {
  const fractionalRows = [0.03, 0.03, 0.03, 0.03, 0.01].map((unitPrice, index) => ({
    code: String(index), description: `fraction ${index}`, unit: "unit", quantity: 1, unitPrice, category: `group ${index}`,
  }));
  const summary = calculateProjectSummary(fractionalRows);
  assert.equal(summary.boq.subtotalNet, 0.13);
  assert.equal(summary.boq.vat, 0.02);
  assert.equal(summary.groups.reduce((sum, group) => sum + group.vat, 0), 0.02);
  assert.equal(Math.round(summary.groups.reduce((sum, group) => sum + group.totalWithVat, 0) * 100) / 100, 0.15);
  assert.ok(summary.groups.every((group) => group.vat >= 0));
  assert.equal(summary.audit.valid, true);
});

test("financial audit allows only the approved 7.4%, 5.4% and 2.7% fees", () => {
  const summary = calculateProjectSummary(rows);
  assert.deepEqual(summary.fees.map((fee) => [fee.key, fee.rate]), [
    ["planning", 0.074], ["management", 0.054], ["supervision", 0.027],
  ]);
  assert.equal(summary.audit.checks.onlyApprovedFees, true);
  assert.equal(summary.audit.checks.estimateGrossEqualsBoqGross, true);
});
