export const caseRoutes = {
  createCase: { method: "POST", path: "/cases" },
  getCase: { method: "GET", pathPattern: /^\/cases\/([^/]+)$/ },
  analyzeCase: { method: "POST", pathPattern: /^\/cases\/([^/]+)\/analyze$/ },
  getCaseStatus: { method: "GET", pathPattern: /^\/cases\/([^/]+)\/status$/ },
  getClarifications: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/clarifications$/,
  },
  submitClarifications: {
    method: "POST",
    pathPattern: /^\/cases\/([^/]+)\/clarifications$/,
  },
  getDekelCandidates: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/dekel-candidates$/,
  },
  getMavnadimCandidates: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/mavnadim-candidates$/,
  },
  saveMavnadimSelection: {
    method: "POST",
    pathPattern: /^\/cases\/([^/]+)\/mavnadim-selection$/,
  },
  getMavnadimSelection: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/mavnadim-selection$/,
  },
  getMavnadimAncillaryPreview: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/mavnadim-ancillary-preview$/,
  },
  saveMavnadimAncillarySelection: {
    method: "POST",
    pathPattern: /^\/cases\/([^/]+)\/mavnadim-ancillary-selection$/,
  },
  saveDekelSelection: {
    method: "POST",
    pathPattern: /^\/cases\/([^/]+)\/dekel-selection$/,
  },
  getDekelSelection: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/dekel-selection$/,
  },
  getOutputDraft: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/output-draft$/,
  },
  getOutputs: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/outputs$/,
  },
  generateCaseOutputs: {
    method: "POST",
    pathPattern: /^\/cases\/([^/]+)\/generate$/,
  },
  getDekelEstimatePreview: {
    method: "GET",
    pathPattern: /^\/cases\/([^/]+)\/dekel-estimate-preview$/,
  },
} as const;
