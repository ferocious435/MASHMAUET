export interface TemplateDefinition {
  templateId: string;
  templateName: string;
  templateVersion: string;
  outputFormat: "docx" | "pdf" | "json";
  fieldsSchemaJson: Record<string, string>;
  financialLinesSchemaJson: string[];
  requiredFieldsJson: string[];
  insertionRulesJson: Record<string, string>;
}

export interface PricebookItem {
  itemId: string;
  pricebookId: string;
  code: string;
  description: string;
  normalizedDescription: string;
  unit: string;
  unitPrice: number;
  section: string;
  subsection: string;
  tagsJson: string[];
  synonymsJson: string[];
  activeFlag: boolean;
  metadataJson: Record<string, string>;
}

export interface TemplateMappingRule {
  ruleId: string;
  templateId: string;
  targetLineKey: string;
  pricebookFilterJson: {
    sections: string[];
    tags: string[];
  };
  aggregationLogic: "sum" | "max";
  allowMergeFlag: boolean;
  requiresSeparateOutputFlag: boolean;
  activeFlag: boolean;
}
