export interface MavnadimCatalogAddon {
  label: string;
  price: number;
}

export interface MavnadimCatalogItem {
  catalogItemId: string;
  displayName: string;
  shortLabel: string;
  dimensionsLabel: string;
  category:
    | "residential"
    | "sanitation"
    | "service"
    | "commercial"
    | "club"
    | "hotel"
    | "modular";
  basePrice: number;
  sourceImageName: string;
  includedFeatures: string[];
  optionalAddons: MavnadimCatalogAddon[];
  possibleUses: string[];
  tags: string[];
  notes: string[];
}

export interface MavnadimCatalogSummary {
  exists: boolean;
  directoryPath: string;
  sourceImagesCount: number;
  itemsCount: number;
  error: string | null;
}

export interface MavnadimCandidateMatch {
  catalogItemId: string;
  displayName: string;
  shortLabel: string;
  category: MavnadimCatalogItem["category"];
  dimensionsLabel: string;
  basePrice: number;
  sourceImageName: string;
  score: number;
  matchReason: string;
  tags: string[];
}

export interface MavnadimAncillaryRecommendation {
  key:
    | "foundation"
    | "placement_infrastructure"
    | "electricity_connection"
    | "water_connection"
    | "sewer_connection";
  title: string;
  status:
    | "explicitly_requested"
    | "conditional_review"
    | "usually_not_required";
  reason: string;
  suggestedDekelSearchTerms: string[];
  responsibleSkill: string;
}
