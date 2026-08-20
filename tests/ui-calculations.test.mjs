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
