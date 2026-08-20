import type { CaseRecord } from "../../cases/domain/case-schemas.ts";
import type { TemplateDefinition } from "../../references/domain/reference-schemas.ts";
import type { CaseDekelEstimatePreview } from "../../references/services/dekel-case-estimate-service.ts";

export interface MasmachOmdanLine {
  serialNumber: number;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  sourceActivityNumber: string | null;
  sourceChapterCode: string | null;
}

export interface MasmachSummarySection {
  sectionTitle: string;
  documentTypeLabel: string;
  caseReferenceLabel: string;
  caseReferenceValue: string;
  templateLabel: string;
  templateValue: string;
  generatedAtLabel: string;
  generatedAtValue: string;
  projectNameLabel: string;
  projectNameValue: string;
}

export interface MasmachBudgetBreakdownRow {
  serialNumber: number;
  subject: string;
  requestName: string;
  amount: number;
  planningComplexity: string;
  budgetingComplexity: string;
  wbsCode: string;
}

export interface MasmachBudgetBreakdownSection {
  sectionTitle: string;
  columns: string[];
  rows: MasmachBudgetBreakdownRow[];
  executionSubtotal: number;
  managementFeePercent: number;
  managementFeeAmount: number;
  totalProjectCost: number;
}

export interface MasmachScheduleRow {
  activity: string;
  activeMonths: number[];
}

export interface MasmachScheduleSection {
  sectionTitle: string;
  months: number[];
  rows: MasmachScheduleRow[];
}

export interface MasmachRiskRow {
  serialNumber: number;
  riskDescription: string;
  projectStage: string;
  riskType: string;
  probability: string;
  budgetImpact: string;
  qualityImpact: string;
  scheduleImpact: string;
  severity: string;
  mitigation: string;
  notes: string;
}

export interface MasmachRiskManagementSection {
  sectionTitle: string;
  columns: string[];
  rows: MasmachRiskRow[];
}

export interface MasmachDocumentTemplate {
  title: string;
  projectDescription: string;
  summarySection: MasmachSummarySection;
  backgroundSection: MasmachNarrativeSection;
  objectiveSection: MasmachNarrativeSection;
  scopeSection: MasmachBulletSection;
  omdanSection: {
    sectionTitle: string;
    columns: string[];
    lines: MasmachOmdanLine[];
    executionSubtotal: number;
    managementFeePercent: number;
    managementFeeAmount: number;
    totalProjectCost: number;
  };
  remarksSection: MasmachBulletSection;
  budgetBreakdownSection: MasmachBudgetBreakdownSection;
  scheduleSection: MasmachScheduleSection;
  riskManagementSection: MasmachRiskManagementSection;
  appendicesSection: MasmachBulletSection;
}

export interface MasmachNarrativeSection {
  sectionTitle: string;
  paragraphs: string[];
}

export interface MasmachBulletSection {
  sectionTitle: string;
  items: string[];
}

export function buildMasmachTemplateDocument(input: {
  case: CaseRecord;
  template: TemplateDefinition;
  generatedAt: string;
  estimatePreview: CaseDekelEstimatePreview;
  omdanLines: MasmachOmdanLine[];
}): MasmachDocumentTemplate {
  const uniqueChapterCodes = [
    ...new Set(
      input.case.analysis.selectedDekelLines
        .map((line) => line.sourceChapterCode)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const budgetBreakdownSection = buildBudgetBreakdownSection({
    case: input.case,
    estimatePreview: input.estimatePreview,
  });
  const scheduleSection = buildScheduleSection({
    case: input.case,
    budgetBreakdownRowsCount: budgetBreakdownSection.rows.length,
    uniqueChapterCodes,
  });
  const riskManagementSection = buildRiskManagementSection({
    case: input.case,
    scheduleMonthsCount: scheduleSection.months.length,
    uniqueChapterCodes,
  });

  return {
    title: `מסמך משמעויות - ${input.case.title}`,
    projectDescription: input.case.rawDescription,
    summarySection: {
      sectionTitle: "נתוני מסמך",
      documentTypeLabel: "סוג מסמך",
      caseReferenceLabel: "מזהה מקרה",
      caseReferenceValue: input.case.caseId,
      templateLabel: "תבנית",
      templateValue: `${input.template.templateName} v${input.template.templateVersion}`,
      generatedAtLabel: "זמן יצירה",
      generatedAtValue: input.generatedAt,
      projectNameLabel: "שם הפרויקט",
      projectNameValue: input.case.title,
    },
    backgroundSection: buildBackgroundSectionV2(input.case),
    objectiveSection: buildObjectiveSectionV2(input.case),
    scopeSection: buildScopeSectionV2(input.case),
    omdanSection: {
      sectionTitle: "אומדן",
      columns: ["מס''ד", "קוד", "תיאור", "כמות", "יחידה", "מחיר יחידה", "סה''כ"],
      lines: input.omdanLines,
      executionSubtotal: input.estimatePreview.executionSubtotal,
      managementFeePercent: input.estimatePreview.managementFeePercent,
      managementFeeAmount: input.estimatePreview.managementFeeAmount,
      totalProjectCost: input.estimatePreview.totalProjectCost,
    },
    remarksSection: buildRemarksSection({
      case: input.case,
      estimatePreview: input.estimatePreview,
    }),
    budgetBreakdownSection,
    scheduleSection,
    riskManagementSection,
    appendicesSection: buildAppendicesSection(input.case),
  };
}

function buildBackgroundSection(caseRecord: CaseRecord): MasmachNarrativeSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  const selectedMavnadim = caseRecord.analysis.selectedMavnadimItem;
  if (workLocation) {
    return {
      sectionTitle: "רקע",
      paragraphs: [
        `מסמך זה מרכז את משמעויות הפרויקט עבור "${caseRecord.title}" בהתאם לנתוני הקלט שנאספו עבור המקרה.`,
        `מוקד העבודה שזוהה מהקלט: ${workLocation}.`,
        `המסמך נבנה על בסיס התיאור הבא: ${caseRecord.rawDescription}`,
      ],
    };
  }
  if (workLocation) {
    return {
      sectionTitle: "׳¨׳§׳¢",
      paragraphs: [
        ...(selectedMavnadim === null
          ? []
          : [`Selected modular structure: ${formatMavnadimSelectionLabel(selectedMavnadim)}.`]),
        `׳׳¡׳׳ ׳–׳” ׳׳¨׳›׳– ׳׳× ׳׳©׳׳¢׳•׳™׳•׳× ׳”׳₪׳¨׳•׳™׳§׳˜ ׳¢׳‘׳•׳¨ "${caseRecord.title}" ׳‘׳”׳×׳׳ ׳׳ ׳×׳•׳ ׳™ ׳”׳§׳׳˜ ׳©׳ ׳׳¡׳₪׳• ׳¢׳‘׳•׳¨ ׳”׳׳§׳¨׳”.`,
        `׳׳•׳§׳“ ׳”׳¢׳‘׳•׳“׳” ׳©׳–׳•׳”׳” ׳׳”׳§׳׳˜: ${workLocation}.`,
        ...(selectedMavnadim === null
          ? []
          : [`Selected modular structure: ${formatMavnadimSelectionLabel(selectedMavnadim)}.`]),
        `׳”׳׳¡׳׳ ׳ ׳‘׳ ׳” ׳¢׳ ׳‘׳¡׳™׳¡ ׳”׳×׳™׳׳•׳¨ ׳”׳‘׳: ${caseRecord.rawDescription}`,
      ],
    };
  }
  return {
    sectionTitle: "רקע",
    paragraphs: [
      `מסמך זה מרכז את משמעויות הפרויקט עבור "${caseRecord.title}" בהתאם לנתוני הקלט שנאספו עבור המקרה.`,
      `המסמך נבנה על בסיס התיאור הבא: ${caseRecord.rawDescription}`,
    ],
  };
}

function buildObjectiveSection(caseRecord: CaseRecord): MasmachNarrativeSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  if (workLocation) {
    return {
      sectionTitle: "מטרת המשימה",
      paragraphs: [
        `לתרגם את דרישת הפרויקט "${caseRecord.title}" למסמך משמעויות סדור הכולל אומדן, לוח עקרוני, ניתוח סיכונים וחומר בקרה להמשך אישור.`,
        `הפרטים המילוליים במסמך יתייחסו למוקד העבודה: ${workLocation}.`,
      ],
    };
  }
  if (workLocation) {
    return {
      sectionTitle: "׳׳˜׳¨׳× ׳”׳׳©׳™׳׳”",
      paragraphs: [
        `׳׳×׳¨׳’׳ ׳׳× ׳“׳¨׳™׳©׳× ׳”׳₪׳¨׳•׳™׳§׳˜ "${caseRecord.title}" ׳׳׳¡׳׳ ׳׳©׳׳¢׳•׳™׳•׳× ׳¡׳“׳•׳¨ ׳”׳›׳•׳׳ ׳׳•׳׳“׳, ׳׳•׳— ׳¢׳§׳¨׳•׳ ׳™, ׳ ׳™׳×׳•׳— ׳¡׳™׳›׳•׳ ׳™׳ ׳•׳—׳•׳׳¨ ׳‘׳§׳¨׳” ׳׳”׳׳©׳ ׳׳™׳©׳•׳¨.`,
        `׳”׳¤׳¨׳˜׳™׳ ׳”׳׳™׳׳•׳׳™׳™׳ ׳‘׳׳¡׳׳ ׳™׳ª׳™׳™׳—׳¡׳• ׳׳׳•׳§׳“ ׳”׳¢׳‘׳•׳“׳”: ${workLocation}.`,
      ],
    };
  }
  return {
    sectionTitle: "מטרת המשימה",
    paragraphs: [
      `לתרגם את דרישת הפרויקט "${caseRecord.title}" למסמך משמעויות סדור הכולל אומדן, לוח עקרוני, ניתוח סיכונים וחומר בקרה להמשך אישור.`,
    ],
  };
}

function buildScopeSection(caseRecord: CaseRecord): MasmachBulletSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  const items = [
    ...new Set(
      caseRecord.analysis.selectedDekelLines.map((line) => line.description.trim()),
    ),
  ];
  const compactScopeFragments = extractCompactScopeFragments(caseRecord.rawDescription);
  if (workLocation) {
    return {
      sectionTitle: "תכולת הפרויקט",
      items: [
        `מיקום העבודה: ${workLocation}`,
        ...(items.length > 0
          ? items
          : compactScopeFragments.length > 0
            ? compactScopeFragments
            : [
                "טרם נבחרו סעיפי ביצוע סופיים. יש להשלים בחירת סעיפי דקל מאושרים כדי לבנות תכולת פרויקט מלאה.",
              ]),
      ],
    };
  }

  if (workLocation) {
    return {
      sectionTitle: "׳×׳›׳•׳׳× ׳”׳₪׳¨׳•׳™׳§׳˜",
      items: [
        `מיקום העבודה: ${workLocation}`,
        ...(items.length > 0
          ? items
          : compactScopeFragments.length > 0
            ? compactScopeFragments
            : [
                "׳˜׳¨׳ ׳ ׳‘׳—׳¨׳• ׳¡׳¢׳™׳₪׳™ ׳‘׳™׳¦׳•׳¢ ׳¡׳•׳₪׳™׳™׳. ׳™׳© ׳׳”׳©׳׳™׳ ׳‘׳—׳™׳¨׳× ׳¡׳¢׳™׳₪׳™ ׳“׳§׳ ׳׳׳•׳©׳¨׳™׳ ׳›׳“׳™ ׳׳‘׳ ׳•׳× ׳×׳›׳•׳׳× ׳₪׳¨׳•׳™׳§׳˜ ׳׳׳׳”.",
              ]),
      ],
    };
  }

  return {
    sectionTitle: "תכולת הפרויקט",
    items:
      items.length > 0
        ? items
        : compactScopeFragments.length > 0
          ? compactScopeFragments
        : [
            "טרם נבחרו סעיפי ביצוע סופיים. יש להשלים בחירת סעיפי דקל מאושרים כדי לבנות תכולת פרויקט מלאה.",
          ],
  };
}

function buildBackgroundSectionV2(caseRecord: CaseRecord): MasmachNarrativeSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  const selectedMavnadim = caseRecord.analysis.selectedMavnadimItem;
  const paragraphs = [
    `מסמך זה מרכז את משמעויות הפרויקט עבור "${caseRecord.title}" בהתאם לנתוני הקלט שנאספו עבור המקרה.`,
  ];

  if (selectedMavnadim !== null) {
    paragraphs.push(
      `במקרה זה נבחר מבנה מוכן מסוג ${formatMavnadimSelectionLabel(selectedMavnadim)} כישות פרויקט מאושרת.`,
    );
  }

  if (workLocation) {
    paragraphs.push(`מוקד העבודה שזוהה מהקלט: ${workLocation}.`);
  }

  paragraphs.push(`המסמך נבנה על בסיס התיאור הבא: ${caseRecord.rawDescription}`);

  return {
    sectionTitle: "רקע",
    paragraphs,
  };
}

function buildObjectiveSectionV2(caseRecord: CaseRecord): MasmachNarrativeSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  const selectedMavnadim = caseRecord.analysis.selectedMavnadimItem;
  const paragraphs = [
    `לתרגם את דרישת הפרויקט "${caseRecord.title}" למסמך משמעויות סדור הכולל אומדן, לוח עקרוני, ניהול סיכונים וחומר בקרה להמשך אישור.`,
  ];

  if (selectedMavnadim !== null) {
    paragraphs.push(
      `היעד כולל גם הצבה או שילוב של ${formatMavnadimSelectionLabel(selectedMavnadim)} יחד עם העבודות הנלוות הנדרשות לפי ה-scope בפועל.`,
    );
  }

  if (workLocation) {
    paragraphs.push(`הניסוח המילולי במסמך יתייחס למוקד העבודה: ${workLocation}.`);
  }

  return {
    sectionTitle: "מטרת המשימה",
    paragraphs,
  };
}

function buildScopeSectionV2(caseRecord: CaseRecord): MasmachBulletSection {
  const workLocation = detectWorkLocation(caseRecord.rawDescription);
  const selectedMavnadim = caseRecord.analysis.selectedMavnadimItem;
  const dekelItems = [
    ...new Set(
      caseRecord.analysis.selectedDekelLines.map((line) => line.description.trim()),
    ),
  ];
  const compactScopeFragments = extractCompactScopeFragments(caseRecord.rawDescription);
  const items: string[] = [];

  if (workLocation) {
    items.push(`מיקום העבודה: ${workLocation}`);
  }

  if (selectedMavnadim !== null) {
    items.push(`מבנה נבחר: ${formatMavnadimSelectionLabel(selectedMavnadim)}`);
    if (selectedMavnadim.includedFeatures.length > 0) {
      items.push(
        `רכיבים כלולים במבנה: ${selectedMavnadim.includedFeatures.join(", ")}`,
      );
    }

    for (const recommendation of selectedMavnadim.ancillaryRecommendations) {
      items.push(
        `עבודה נלווית למבנה [${recommendation.status}]: ${recommendation.title}`,
      );
    }
  }

  if (dekelItems.length > 0) {
    items.push(...dekelItems);
  } else if (compactScopeFragments.length > 0) {
    items.push(...compactScopeFragments);
  } else {
    items.push(
      "טרם נבחרו סעיפי ביצוע סופיים. יש להשלים בחירת סעיפי דקל מאושרים כדי לבנות תכולת פרויקט מלאה.",
    );
  }

  return {
    sectionTitle: "תכולת הפרויקט",
    items: [...new Set(items)],
  };
}

function formatMavnadimSelectionLabel(
  selection: NonNullable<CaseRecord["analysis"]["selectedMavnadimItem"]>,
): string {
  return `${selection.displayName} (${selection.dimensionsLabel})`;
}

function extractCompactScopeFragments(rawDescription: string): string[] {
  const normalizedDescription = rawDescription
    .replace(/[+]/g, ",")
    .replace(/[;|]/g, ",")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedDescription.length === 0) {
    return [];
  }

  const fragments = normalizedDescription
    .split(",")
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 3)
    .filter((fragment) => !/^נדרש|דורש|יש\s+ל/i.test(fragment));

  return [...new Set(fragments)].slice(0, 6);
}

function detectWorkLocation(rawDescription: string): string | null {
  const candidates = [
    ...matchLocationCandidates(rawDescription, [
      /\b(?:at|in|near)\s+the\s+([a-z][a-z\s-]{2,40}?)(?=[,.;]|$)/giu,
      /\b(?:at|in|near)\s+([a-z][a-z\s-]{2,40}?)(?=[,.;]|$)/giu,
    ]),
    ...matchLocationCandidates(rawDescription, [
      /(?:ב|ליד)\s*([א-ת][א-ת"׳'\- ]{1,30}?)(?=[,.;]|$)/gu,
    ]),
  ];

  return candidates[0] ?? null;
}

function matchLocationCandidates(
  rawDescription: string,
  patterns: RegExp[],
): string[] {
  const locations: string[] = [];

  for (const pattern of patterns) {
    const matches = rawDescription.matchAll(pattern);
    for (const match of matches) {
      const candidate = sanitizeLocationCandidate(match[1]);
      if (candidate) {
        locations.push(candidate);
      }
    }
  }

  return [...new Set(locations)];
}

function sanitizeLocationCandidate(candidate: string | undefined): string | null {
  if (!candidate) {
    return null;
  }

  const normalized = candidate
    .replace(/\b(?:and|with|for)\b.*$/iu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/iu, "")
    .replace(/[.]+$/u, "")
    .trim();

  if (normalized.length < 2) {
    return null;
  }

  if (!isLikelyLocationPhrase(normalized)) {
    return null;
  }

  return normalized;
}

function isLikelyLocationPhrase(candidate: string): boolean {
  const normalized = candidate.toLocaleLowerCase();
  const englishLocationKeywords = [
    "entrance",
    "room",
    "corridor",
    "kitchen",
    "bathroom",
    "roof",
    "lobby",
    "opening",
    "area",
    "hall",
    "stair",
  ];
  const hebrewLocationKeywords = [
    "כניסה",
    "חדר",
    "מסדרון",
    "מטבח",
    "שירותים",
    "מקלחת",
    "גג",
    "לובי",
    "פתח",
    "אזור",
    "חצר",
    "מדרגות",
  ];

  return (
    englishLocationKeywords.some((keyword) => normalized.includes(keyword)) ||
    hebrewLocationKeywords.some((keyword) => normalized.includes(keyword))
  );
}

function buildBudgetBreakdownSection(input: {
  case: CaseRecord;
  estimatePreview: CaseDekelEstimatePreview;
}): MasmachBudgetBreakdownSection {
  const groupedSelections = new Map<
    string,
    {
      descriptions: string[];
      amount: number;
      units: Set<string>;
      chapterCode: string | null;
    }
  >();

  for (const selection of input.case.analysis.selectedDekelLines) {
    const chapterCode = selection.sourceChapterCode ?? "ללא פרק";
    const currentBucket = groupedSelections.get(chapterCode) ?? {
      descriptions: [],
      amount: 0,
      units: new Set<string>(),
      chapterCode: selection.sourceChapterCode,
    };
    currentBucket.descriptions.push(selection.description);
    currentBucket.amount += selection.quantity * selection.unitPrice;
    currentBucket.units.add(selection.unit);
    groupedSelections.set(chapterCode, currentBucket);
  }

  const rows = [...groupedSelections.entries()].map(([groupKey, bucket], index) => {
    const requestName = summarizeDescriptions(bucket.descriptions);
    const complexityScore = bucket.descriptions.length + bucket.units.size;

    return {
      serialNumber: index + 1,
      subject:
        bucket.chapterCode !== null ? `פרק ${bucket.chapterCode}` : groupKey,
      requestName,
      amount: roundMoney(bucket.amount),
      planningComplexity: toComplexityLabel(complexityScore),
      budgetingComplexity: toComplexityLabel(
        complexityScore + (roundMoney(bucket.amount) >= 1000 ? 1 : 0),
      ),
      wbsCode: `Y${(index + 1) * 10}`,
    };
  });

  return {
    sectionTitle: "להלן פילוח תקציבי לעבודה",
    columns: [
      "נושא",
      "שם הדרישה",
      "עלות (ש''ח)",
      "מורכבות תכנון",
      "מורכבות תקצוב",
      "קבוצת WBS",
    ],
    rows,
    executionSubtotal: input.estimatePreview.executionSubtotal,
    managementFeePercent: input.estimatePreview.managementFeePercent,
    managementFeeAmount: input.estimatePreview.managementFeeAmount,
    totalProjectCost: input.estimatePreview.totalProjectCost,
  };
}

function buildRemarksSection(input: {
  case: CaseRecord;
  estimatePreview: CaseDekelEstimatePreview;
}): MasmachBulletSection {
  const items = [
    `האומדן כולל תכנון/פיקוח בשיעור ${input.estimatePreview.managementFeePercent}%.`,
    "האומדן מבוסס על סעיפי DEKEL שאושרו בשלב review.",
  ];

  for (const warning of input.case.analysis.warnings) {
    items.push(`אזהרה: ${warning}`);
  }

  for (const assumption of input.case.analysis.assumptions) {
    items.push(`הנחה: ${assumption}`);
  }

  if (input.case.analysis.selectedMavnadimItem !== null) {
    items.push(
      `מבנה מוכן נבחר: ${formatMavnadimSelectionLabel(input.case.analysis.selectedMavnadimItem)}.`,
    );
    items.push(
      `מחיר הקטלוג של המבנה המוכן מוצג כמידע ייחוס בלבד ואינו נכלל אוטומטית בסה"כ האומדן עד לאישור מדיניות התקצוב.`,
    );
  }

  return {
    sectionTitle: "הערות לאומדן",
    items,
  };
}

function buildScheduleSection(input: {
  case: CaseRecord;
  budgetBreakdownRowsCount: number;
  uniqueChapterCodes: string[];
}): MasmachScheduleSection {
  const monthsCount = determineScheduleMonths({
    selectedLinesCount: input.case.analysis.selectedDekelLines.length,
    budgetBreakdownRowsCount: input.budgetBreakdownRowsCount,
    warningsCount: input.case.analysis.warnings.length,
    uniqueChapterCodesCount: input.uniqueChapterCodes.length,
  });
  const months = Array.from({ length: monthsCount }, (_, index) => index + 1);
  const executionStart = Math.max(3, Math.min(4, monthsCount - 1));
  const executionEnd = Math.max(executionStart, monthsCount - 1);

  return {
    sectionTitle: "לוח עקרוני (מתייחס למדדי גאנט)",
    months,
    rows: [
      {
        activity: "הגדרת תכנון",
        activeMonths: [1],
      },
      {
        activity: "תכנון מפורט",
        activeMonths: range(1, Math.min(2, monthsCount)),
      },
      {
        activity: "אישור/תיאום תכנון",
        activeMonths: range(Math.min(2, monthsCount), Math.min(3, monthsCount)),
      },
      {
        activity: "התארגנות לביצוע",
        activeMonths: [Math.min(3, monthsCount)],
      },
      {
        activity: "ביצוע",
        activeMonths: range(executionStart, executionEnd),
      },
      {
        activity: "מסירה",
        activeMonths: [monthsCount],
      },
    ],
  };
}

function buildRiskManagementSection(input: {
  case: CaseRecord;
  scheduleMonthsCount: number;
  uniqueChapterCodes: string[];
}): MasmachRiskManagementSection {
  const riskRows: Omit<MasmachRiskRow, "serialNumber">[] = [];

  if (input.case.analysis.assumptions.length > 0) {
    riskRows.push({
      riskDescription: "הסתמכות על הנחות מאושרות במהלך גיבוש המסמך",
      projectStage: "תכנון",
      riskType: "נתונים",
      probability: "בינונית",
      budgetImpact: "בינונית",
      qualityImpact: "נמוכה",
      scheduleImpact: "בינונית",
      severity: "בינוני",
      mitigation: "אימות מול גורם מאשר לפני סגירת האומדן הסופי",
      notes: summarizeList(input.case.analysis.assumptions),
    });
  }

  if (input.case.analysis.warnings.length > 0) {
    riskRows.push({
      riskDescription: "קיימות התראות המחייבות בקרה אנושית לפני הפקה סופית",
      projectStage: "בקרה",
      riskType: "איכות",
      probability: "גבוהה",
      budgetImpact: "בינונית",
      qualityImpact: "גבוהה",
      scheduleImpact: "נמוכה",
      severity: "גבוה",
      mitigation: "מעבר review מלא ואישור בחירת הסעיפים לפני generate",
      notes: summarizeList(input.case.analysis.warnings),
    });
  }

  if (input.uniqueChapterCodes.length > 1) {
    riskRows.push({
      riskDescription: "העבודות נשענות על שילוב סעיפים ממספר פרקי דקל",
      projectStage: "תכנון/ביצוע",
      riskType: "ממשקים",
      probability: "בינונית",
      budgetImpact: "גבוהה",
      qualityImpact: "בינונית",
      scheduleImpact: "בינונית",
      severity: "גבוה",
      mitigation: "בדיקת התאמת כל פרק לתכולת העבודה והפרדה בין עבודות נלוות לליבת העבודה",
      notes: `פרקים: ${input.uniqueChapterCodes.join(", ")}`,
    });
  }

  riskRows.push({
    riskDescription: "פער בין תנאי השטח בפועל לבין תיאור העבודה שהוזן למערכת",
    projectStage: "ביצוע",
    riskType: "שטח",
    probability:
      input.case.analysis.selectedDekelLines.length >= 3 ? "בינונית" : "נמוכה",
    budgetImpact: "בינונית",
    qualityImpact: "בינונית",
    scheduleImpact: "בינונית",
    severity: input.case.analysis.selectedDekelLines.length >= 3 ? "בינוני" : "נמוך",
    mitigation: "בדיקה באתר ואישור סופי של כתב הכמויות לפני יציאה לביצוע",
    notes: `לו''ז משוער: ${input.scheduleMonthsCount} חודשים`,
  });

  riskRows.push({
    riskDescription: "חריגה תקציבית עקב סעיפים נלווים, תיאומים או עבודות משיקות",
    projectStage: "ביצוע/מסירה",
    riskType: "תקציב",
    probability:
      input.case.analysis.selectedDekelLines.length >= 2 ? "בינונית" : "נמוכה",
    budgetImpact: "גבוהה",
    qualityImpact: "נמוכה",
    scheduleImpact: "בינונית",
    severity: "בינוני",
    mitigation: "שימור רזרבה ניהולית ואישור מוקדם של חריגים לפני הוספת סעיפים",
    notes: `סה''כ משוער: ${roundMoney(
      input.case.analysis.selectedDekelLines.reduce(
        (sum, selection) => sum + selection.quantity * selection.unitPrice,
        0,
      ),
    )} ש''ח לפני תכנון/פיקוח`,
  });

  return {
    sectionTitle: "ניהול סיכונים",
    columns: [
      "מס''ד",
      "תיאור הסיכון",
      "שלב הפרויקט",
      "סוג",
      "הסתברות",
      "השפעה תקציבית",
      "השפעה על איכות",
      "השפעה על לו''ז",
      "רמת סיכון",
      "מענה",
      "הערות",
    ],
    rows: riskRows.map((row, index) => ({
      serialNumber: index + 1,
      ...row,
    })),
  };
}

function buildAppendicesSection(caseRecord: CaseRecord): MasmachBulletSection {
  const handwrittenEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) => item.sourceType === "handwritten",
  ).length;
  const typedEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) => item.sourceType === "typed",
  ).length;
  const documentEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) => item.sourceType === "document",
  ).length;
  const photoEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) => item.sourceType === "photo",
  ).length;
  const pendingHandwrittenEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) =>
      item.sourceType === "handwritten" && item.reviewStatus === "needs_review",
  ).length;
  const pendingPhotoEvidenceCount = caseRecord.supportingEvidence.filter(
    (item) => item.sourceType === "photo" && item.reviewStatus === "needs_review",
  ).length;
  const items = [
    "תשריט / מפת מיקום - לצירוף בשלב document assembly הסופי.",
    "מקור אומדן: מחירון DEKEL והבחירות המאושרות במערכת.",
  ];

  if (caseRecord.analysis.selectedMavnadimItem !== null) {
    items.push(
      `מקור מבנה מוכן: ${formatMavnadimSelectionLabel(caseRecord.analysis.selectedMavnadimItem)} | image=${caseRecord.analysis.selectedMavnadimItem.sourceImageName}.`,
    );
  }

  if (
    typedEvidenceCount > 0 ||
    handwrittenEvidenceCount > 0 ||
    documentEvidenceCount > 0 ||
    photoEvidenceCount > 0
  ) {
    items.push(
      `חומר קלט משלים: ${typedEvidenceCount} typed, ${documentEvidenceCount} document, ${photoEvidenceCount} photo, ${handwrittenEvidenceCount} handwritten item(s).`,
    );
  }

  if (caseRecord.analysis.warnings.length > 0) {
    items.push("קיימות התראות review שיש לצרף או להתייחס אליהן לפני הפקה סופית.");
  }

  if (pendingHandwrittenEvidenceCount > 0) {
    items.push(
      `${pendingHandwrittenEvidenceCount} handwritten item(s) נשארו במצב review-only ולא שימשו כ-source of truth.`,
    );
  }

  if (pendingPhotoEvidenceCount > 0) {
    items.push(
      `${pendingPhotoEvidenceCount} photo item(s) נשארו במצב review-only ודורשים הצלבה מול מקור טקסטואלי.`,
    );
  }

  items.push(
    "מסמכים עם כתב יד יטופלו כשכבת review משלימה בלבד, ולא כ-source of truth במקום הטקסט המודפס.",
  );
  items.push(
    "תמונות שטח אינן נחשבות source of truth לבדן; יש להצליב אותן מול מסמך, מצגת, אינפוגרפיקה או הסבר כתוב.",
  );

  return {
    sectionTitle: "נספחים ומסמכי מקור",
    items,
  };
}

function determineScheduleMonths(input: {
  selectedLinesCount: number;
  budgetBreakdownRowsCount: number;
  warningsCount: number;
  uniqueChapterCodesCount: number;
}): number {
  const rawDuration =
    4 +
    (input.selectedLinesCount >= 3 ? 1 : 0) +
    (input.budgetBreakdownRowsCount >= 2 ? 1 : 0) +
    (input.uniqueChapterCodesCount >= 2 ? 1 : 0) +
    (input.warningsCount > 0 ? 1 : 0);

  return Math.max(4, Math.min(7, rawDuration));
}

function summarizeDescriptions(descriptions: string[]): string {
  const uniqueDescriptions = [...new Set(descriptions)];

  if (uniqueDescriptions.length === 1) {
    return uniqueDescriptions[0];
  }

  if (uniqueDescriptions.length === 2) {
    return `${uniqueDescriptions[0]} + ${uniqueDescriptions[1]}`;
  }

  return `${uniqueDescriptions[0]} + ${uniqueDescriptions.length - 1} סעיפים נלווים`;
}

function toComplexityLabel(score: number): string {
  if (score >= 4) {
    return "גבוהה";
  }

  if (score >= 3) {
    return "בינונית";
  }

  return "נמוכה";
}

function summarizeList(values: string[]): string {
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 0) {
    return "ללא הערות";
  }

  if (uniqueValues.length === 1) {
    return uniqueValues[0];
  }

  return `${uniqueValues[0]} (+${uniqueValues.length - 1})`;
}

function range(start: number, end: number): number[] {
  if (end < start) {
    return [start];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
