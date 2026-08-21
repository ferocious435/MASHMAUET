export const BOQ_PAGE_CAPACITY = 62;
export const BOQ_TOTALS_RESERVE = 10;

export function boqRowWeight(row) {
  return Math.max(2.4, 1.25 + Math.ceil(String(row?.description || "").length / 50));
}

export function boqPageWeight(rows) {
  return rows.reduce((total, row) => total + (Number(row.pageWeight) || boqRowWeight(row)), 0);
}

export function paginateBoqRows(rows) {
  const weightedRows = rows.map((row, sourceIndex) => ({
    ...row,
    sourceIndex,
    pageWeight: boqRowWeight(row),
  }));
  const pages = [];
  let current = [];
  let currentWeight = 0;

  for (const row of weightedRows) {
    if (current.length && currentWeight + row.pageWeight > BOQ_PAGE_CAPACITY) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(row);
    currentWeight += row.pageWeight;
  }
  pages.push(current);

  const totalsCapacity = BOQ_PAGE_CAPACITY - BOQ_TOTALS_RESERVE;
  while (pages.at(-1).length > 1 && boqPageWeight(pages.at(-1)) > totalsCapacity) {
    const row = pages.at(-1).shift();
    const previousPage = pages.at(-2);
    if (previousPage && boqPageWeight(previousPage) + row.pageWeight <= BOQ_PAGE_CAPACITY) previousPage.push(row);
    else pages.splice(pages.length - 1, 0, [row]);
  }
  if (pages.at(-1).length === 1 && boqPageWeight(pages.at(-1)) > totalsCapacity) pages.push([]);

  return pages;
}

export function assessA4Document({ narrativePages = [], boqPages = [], totalsBlockCount = 0 }, tolerance = 1) {
  const issues = [];
  if (narrativePages.length !== 3) {
    issues.push({ code: "narrative-page-count", expected: 3, actual: narrativePages.length });
  }
  if (!boqPages.length) issues.push({ code: "missing-boq-page" });
  if (totalsBlockCount !== 1) {
    issues.push({ code: "totals-block-count", expected: 1, actual: totalsBlockCount });
  }
  for (const page of [...narrativePages, ...boqPages]) {
    if (page.contentHeight > page.availableHeight + tolerance) {
      issues.push({
        code: "page-overflow",
        label: page.label,
        overflowBy: page.contentHeight - page.availableHeight,
      });
    }
  }
  return issues;
}
