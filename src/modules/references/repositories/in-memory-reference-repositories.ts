import type {
  PricebookItem,
  TemplateDefinition,
  TemplateMappingRule,
} from "../domain/reference-schemas.ts";

export const DEFAULT_TEMPLATE_ID = "masmach-template-v1";
export const DEFAULT_PRICEBOOK_ID = "pricebook-v1";

const templates: TemplateDefinition[] = [
  {
    templateId: DEFAULT_TEMPLATE_ID,
    templateName: "מסמך משמעויות / MVP Template",
    templateVersion: "1.0.0",
    outputFormat: "docx",
    fieldsSchemaJson: {
      documentTitle: "text",
      caseId: "text",
      projectDescription: "text",
      totalAmount: "number",
      budgetBreakdownTotal: "number",
      scheduleDurationMonths: "number",
      riskItemsCount: "number",
      selectedLinesCount: "number",
    },
    financialLinesSchemaJson: [
      "omdan",
      "budget_breakdown",
      "schedule",
      "risk_management",
    ],
    requiredFieldsJson: ["documentTitle", "projectDescription", "totalAmount"],
    insertionRulesJson: {
      omdan: "document.omdanSection",
      budget_breakdown: "document.budgetBreakdownSection",
      schedule: "document.scheduleSection",
      risk_management: "document.riskManagementSection",
    },
  },
];

const pricebookItems: PricebookItem[] = [
  {
    itemId: "pb-001",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "DEM-FLR-001",
    description: "Демонтаж старого напольного покрытия",
    normalizedDescription: "демонтаж старого напольного покрытия",
    unit: "m2",
    unitPrice: 25,
    section: "demolition",
    subsection: "floor",
    tagsJson: ["демонтаж", "пол", "покрытие", "снятие"],
    synonymsJson: ["снять покрытие", "снять пол"],
    activeFlag: true,
    metadataJson: {},
  },
  {
    itemId: "pb-002",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "PREP-FLR-001",
    description: "Подготовка основания пола",
    normalizedDescription: "подготовка основания пола",
    unit: "m2",
    unitPrice: 18,
    section: "preparation",
    subsection: "floor",
    tagsJson: ["подготовка", "основание", "пол"],
    synonymsJson: ["подготовить основание"],
    activeFlag: true,
    metadataJson: {},
  },
  {
    itemId: "pb-003",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "INS-FLR-001",
    description: "Укладка нового напольного покрытия",
    normalizedDescription: "укладка нового напольного покрытия",
    unit: "m2",
    unitPrice: 95,
    section: "installation",
    subsection: "floor",
    tagsJson: ["монтаж", "пол", "покрытие", "укладка"],
    synonymsJson: ["сделать новое покрытие", "монтаж пола"],
    activeFlag: true,
    metadataJson: {},
  },
  {
    itemId: "pb-004",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "LOG-001",
    description: "Вывоз строительного мусора",
    normalizedDescription: "вывоз строительного мусора",
    unit: "komplet",
    unitPrice: 350,
    section: "logistics",
    subsection: "waste",
    tagsJson: ["вывоз", "мусор", "логистика"],
    synonymsJson: ["убрать мусор"],
    activeFlag: true,
    metadataJson: {},
  },
  {
    itemId: "pb-005",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "DR-001",
    description: "Замена двери",
    normalizedDescription: "замена двери",
    unit: "unit",
    unitPrice: 780,
    section: "doors",
    subsection: "replacement",
    tagsJson: ["дверь", "замена"],
    synonymsJson: ["поменять дверь"],
    activeFlag: true,
    metadataJson: {},
  },
  {
    itemId: "pb-006",
    pricebookId: DEFAULT_PRICEBOOK_ID,
    code: "FIN-WALL-001",
    description: "Восстановление примыканий и локальный ремонт стены",
    normalizedDescription: "восстановление примыканий и локальный ремонт стены",
    unit: "m2",
    unitPrice: 42,
    section: "finishing",
    subsection: "wall",
    tagsJson: ["стена", "ремонт", "примыкание"],
    synonymsJson: ["подправить вокруг", "ремонт участка стены"],
    activeFlag: true,
    metadataJson: {},
  }
];

const mappingRules: TemplateMappingRule[] = [
  {
    ruleId: "map-001",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "demolition",
    pricebookFilterJson: { sections: ["demolition"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
  {
    ruleId: "map-002",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "preparation",
    pricebookFilterJson: { sections: ["preparation"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
  {
    ruleId: "map-003",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "installation",
    pricebookFilterJson: { sections: ["installation"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
  {
    ruleId: "map-004",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "doors",
    pricebookFilterJson: { sections: ["doors"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
  {
    ruleId: "map-005",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "finishing",
    pricebookFilterJson: { sections: ["finishing"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
  {
    ruleId: "map-006",
    templateId: DEFAULT_TEMPLATE_ID,
    targetLineKey: "logistics",
    pricebookFilterJson: { sections: ["logistics"], tags: [] },
    aggregationLogic: "sum",
    allowMergeFlag: true,
    requiresSeparateOutputFlag: false,
    activeFlag: true,
  },
];

export class InMemoryTemplateRepository {
  public findById(templateId: string): TemplateDefinition | null {
    return templates.find((item) => item.templateId === templateId) ?? null;
  }

  public list(): TemplateDefinition[] {
    return [...templates];
  }
}

export class InMemoryPricebookRepository {
  public listByPricebookId(pricebookId: string): PricebookItem[] {
    return pricebookItems.filter((item) => item.pricebookId === pricebookId);
  }

  public listCatalog(): { pricebookId: string; itemsCount: number }[] {
    return [
      {
        pricebookId: DEFAULT_PRICEBOOK_ID,
        itemsCount: pricebookItems.length,
      },
    ];
  }
}

export class InMemoryMappingRuleRepository {
  public listByTemplateId(templateId: string): TemplateMappingRule[] {
    return mappingRules.filter((item) => item.templateId === templateId);
  }
}
