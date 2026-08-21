# Graph Report - MASHMAUET  (2026-08-21)

## Corpus Check
- 156 files · ~94,291 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1195 nodes · 2813 edges · 76 communities (48 shown, 28 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 228 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Web Interface
- Professional Knowledge Retrieval
- DEKEL Pricebook Ingestion
- Local Workspace API
- Project Chat Context
- Document Template Generation
- Case Orchestration
- Case Analysis Pipeline
- Local Project Storage
- Workspace Validation Logging
- Product Architecture
- Skill Orchestration
- Building Work Specifications
- Live Case Validation
- MAVNADIM Matching
- Automated Test Pipeline
- DEKEL Candidate Matching
- Application Composition
- Build Configuration
- Evidence Validation
- HTTP Controllers
- Codex Chat Gateway
- DEKEL Estimate Preview
- Document Policy References
- TypeScript Configuration
- Case Draft Assembly
- Case Service Operations
- Contract Specification Framework
- Output Export Pipeline
- Request Input Validation
- Material Extraction Tests
- DEKEL Routing
- MAVNADIM Catalog
- Financial Calculation Rules
- Local Request Security
- Skill Governance
- Quantity Extraction
- Blue Book Work Types
- Infrastructure Work Specifications
- MAVNADIM DEKEL Packaging
- Road Infrastructure Chapters
- Fabrication Specifications
- Blue Book Technical Chapters
- Blue Book Execution Rules
- Upload Validation
- Clarification Policy
- Financial Type Contracts
- Rate Limiting
- Masonry Corrections
- Painting Specifications
- Blue Book Group 50
- Blue Book Group 51
- Blue Book Group 52
- Blue Book Group 53
- Blue Book Group 54
- Blue Book Group 55
- Blue Book Group 56
- Blue Book Group 57
- Blue Book Group 58
- Blue Book Group 59
- Blue Book Group 60
- Blue Book Group 61
- Blue Book Group 62
- Blue Book Group 63
- Blue Book Group 64
- Blue Book Group 65
- Blue Book Group 66
- Blue Book Group 67
- Blue Book Group 68
- Blue Book Group 69
- Blue Book Group 70
- Blue Book Group 71
- Blue Book Group 72
- Local Workspace Interface

## God Nodes (most connected - your core abstractions)
1. `main()` - 49 edges
2. `LocalWorkspaceService` - 44 edges
3. `createApp()` - 40 edges
4. `LocalProjectStore` - 38 edges
5. `CaseService` - 34 edges
6. `CaseRecord` - 28 edges
7. `escapeHtml()` - 24 edges
8. `CaseController` - 23 edges
9. `PublicLocalProject` - 21 edges
10. `SkillOrchestratorService` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Project-Local Skill Layer` --semantically_similar_to--> `Production Skill Ecosystem`  [INFERRED] [semantically similar]
  PROJECT-SKILLS.md → docs/archive/source-inputs/SKILLS DOWNLOAD.md.txt
- `Hidden Works Library` --semantically_similar_to--> `Ancillary Works Policy`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/RAAEN.md.txt → ANCILLARY-WORKS-POLICY.md
- `No-Guessing Principle` --semantically_similar_to--> `Clarification and Review Gate`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/PRD.md.txt → PRD.md
- `Skill Execution Policy` --semantically_similar_to--> `Skill Governance Gates`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/SKILLS DOWNLOAD.md.txt → PROJECT-SKILLS.md
- `General Skills SOP` --conceptually_related_to--> `Production Skill Ecosystem`  [INFERRED]
  GENERAL-SKILLS-SOP.md → docs/archive/source-inputs/SKILLS DOWNLOAD.md.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Controlled Case to Traceable Document** — prd_controlled_case_pipeline, prd_dekel_pricebook, prd_mavnadim_catalog, prd_clarification_and_review_gate, prd_traceable_output_package [EXTRACTED 1.00]
- **Context-Bounded Professional Retrieval** — readme_professional_reference_search, docs_backend_runbook_reference_only_corpora, docs_backend_runbook_knowledge_cache, docs_architecture_adr_001_professional_reference_retrieval_professional_knowledge_service, docs_architecture_adr_001_professional_reference_retrieval_applicability_boundary [EXTRACTED 1.00]
- **Governed Skill Orchestration** — project_skills_project_skill_layer, docs_archive_source_inputs_skills_download_md_skill_registry, docs_archive_source_inputs_skills_download_md_skill_manager, docs_archive_source_inputs_skills_download_md_skill_router, docs_archive_source_inputs_skills_download_md_execution_policy, docs_archive_source_inputs_skills_download_md_audit_and_fallback [INFERRED 0.95]
- **MASHMAUET Controlled Output Governance** — docs_reference_policies_ancillary_works_policy_controlled_ancillary_inclusion, docs_reference_policies_quantity_rule_matrix_strongest_available_quantity, docs_reference_policies_text_policy_matrix_source_grounded_wording, docs_reference_policies_masmach_section_contracts_required_output_sections [INFERRED 0.85]
- **MASHMAUET Product Delivery System** — docs_reference_process_general_skills_sop_automated_skill_orchestration, docs_reference_product_backlog_mvp_hardening_queue, docs_reference_product_roadmap_six_phase_delivery [INFERRED 0.75]
- **Israeli Government Construction Document Framework** — homer_3210_2019_government_contract_3210, homer_blue_book_1_1_2026_publication_table, homer_blue_book_2006_engineering_contract_documents, homer_blue_book_00_2009_general_specification_00, homer_blue_book_01_2011_general_specification_01, homer_blue_book_55_2000_general_specification_55 [EXTRACTED 1.00]

## Communities (76 total, 28 thin omitted)

### Community 0 - "Web Interface"
Cohesion: 0.06
Nodes (85): addChatMessage(), analyzeDekelReview(), backupKindLabel(), boqRow(), buildEvidenceChatContext(), buildEvidenceIndex(), canvasToJpeg(), connectCodex() (+77 more)

### Community 1 - "Professional Knowledge Retrieval"
Cohesion: 0.07
Nodes (33): buildExpandedTerms(), buildSource(), CachedPdf, CHAPTER_TERMS, chunkPage(), deduplicateResults(), detectChapterCodes(), detectIntents() (+25 more)

### Community 2 - "DEKEL Pricebook Ingestion"
Cohesion: 0.09
Nodes (36): dekelExpectedHeaders, DekelWorkbookColumnMap, DekelWorkbookRow, PricebookItem, DekelCatalogService, DekelWorkbookSummary, buildDekelEstimatePreview(), DekelEstimatePreview (+28 more)

### Community 3 - "Local Workspace API"
Cohesion: 0.16
Nodes (6): CodexGateway, LocalDekelReview, PublicLocalProject, toPublicProject(), LocalWorkspaceService, requireReadyDekelReview()

### Community 4 - "Project Chat Context"
Cohesion: 0.07
Nodes (38): KeyedMutex, ChatProposal, LocalDekelCandidate, LocalDekelReviewLine, LocalFinancialAudit, ProjectChatMessage, PublicLocalMaterial, ALLOWED_DOCUMENT_PATHS (+30 more)

### Community 5 - "Document Template Generation"
Cohesion: 0.09
Nodes (38): CaseOutputDraft, roundMoney(), roundMoney(), buildAppendicesSection(), buildBackgroundSection(), buildBackgroundSectionV2(), buildBudgetBreakdownSection(), buildMasmachTemplateDocument() (+30 more)

### Community 6 - "Case Orchestration"
Cohesion: 0.15
Nodes (9): CaseRecord, SelectedDekelLine, CaseRepository, InMemoryCaseRepository, appendManualTrace(), CaseService, buildCaseEstimatePreviewFromSelectedDekelLines(), CaseDekelEstimatePreview (+1 more)

### Community 7 - "Case Analysis Pipeline"
Cohesion: 0.08
Nodes (37): AggregatedTemplateLine, CandidateMatch, DetailedCostLine, DetectedGeometry, DimensionInput, MatchType, PipelineStage, PipelineStageState (+29 more)

### Community 8 - "Local Project Storage"
Cohesion: 0.13
Nodes (10): DEFAULT_DOCUMENT, ensureDocumentEvidence(), exists(), isLocalDekelReview(), LocalProjectStore, migrateProject(), validateProjectsDirectory(), LocalBackupManifest (+2 more)

### Community 9 - "Workspace Validation Logging"
Cohesion: 0.09
Nodes (28): LocalAppConfig, decodeFileName(), LocalWorkspaceController, normalizeMaterialContentType(), readBinary(), readJson(), routeLabel(), asPublicError() (+20 more)

### Community 10 - "Product Architecture"
Cohesion: 0.07
Nodes (35): Ancillary Works Policy, Product Backlog, Project Applicability Boundary, Hybrid Lexical and Metadata Ranking, Lazy Local Retrieval, ProfessionalKnowledgeService, Semantic Index Revisit Condition, Engineering Calculation Document System (+27 more)

### Community 11 - "Skill Orchestration"
Cohesion: 0.09
Nodes (23): buildBaseSkillSource(), dedupe(), getScopeKey(), getTaskDefinition(), GovernanceConfig, isFileNotFoundError(), isRecord(), RegistryConfig (+15 more)

### Community 12 - "Building Work Specifications"
Cohesion: 0.07
Nodes (34): Cast-in-Place Concrete Specification, Concrete Quality Control, Precast Concrete Components, Precast Erection and Tolerances, Masonry Materials and Joints, Masonry Work Specification, Waterproofing Specification, Waterproofing Systems and Tests (+26 more)

### Community 13 - "Live Case Validation"
Cohesion: 0.11
Nodes (32): asArray(), asObject(), asStringArray(), buildCasePayload(), buildObservations(), buildReport(), buildTimestampSlug(), deriveDescriptionFromSupportingEvidence() (+24 more)

### Community 14 - "MAVNADIM Matching"
Cohesion: 0.12
Nodes (30): MavnadimAncillaryRecommendation, MavnadimCandidateMatch, MavnadimCatalogAddon, buildMavnadimAncillaryRecommendations(), buildMavnadimCandidateMatches(), buildRecommendation(), compareRecommendationPriority(), createAreaSignature() (+22 more)

### Community 15 - "Automated Test Pipeline"
Cohesion: 0.14
Nodes (31): buildCaseEstimatePreviewFromDekelCandidates(), readDekelRowsFromExtractedWorkbook(), buildPipelineWithLiveDekelFallback(), buildPipelineWithMissingReferences(), buildStoredZip(), computeCrc32(), crc32Table, createFixtureDekelXlsx() (+23 more)

### Community 16 - "DEKEL Candidate Matching"
Cohesion: 0.11
Nodes (31): WorkItem, buildDekelSearchQueryPlan(), buildWorkItemSearchQuery(), calculateRouteAdjustment(), calculateWorkTypeSemanticAdjustment(), chapterRoutingRules, dedupeDekelQueryPlan(), DekelRoutingHints (+23 more)

### Community 17 - "Application Composition"
Cohesion: 0.11
Nodes (21): executeRoutedRequest(), MashmauetApplication, readJsonBody(), sendJson(), summarizeForRoute(), toHttpResult(), integerFromEnvironment(), loadLocalAppConfig() (+13 more)

### Community 18 - "Build Configuration"
Cohesion: 0.07
Nodes (29): mammoth, @napi-rs/canvas, @openai/codex, dependencies, mammoth, @napi-rs/canvas, @openai/codex, pdfjs-dist (+21 more)

### Community 19 - "Evidence Validation"
Cohesion: 0.08
Nodes (28): CaseAnalysisSnapshot, CaseClarificationAnswerInput, CaseClarificationSubmissionInput, CaseCreateInput, CaseDekelSelectionInput, CaseDekelSelectionInputLine, CaseMavnadimAncillarySelectionInput, CaseMavnadimAncillarySelectionInputLine (+20 more)

### Community 20 - "HTTP Controllers"
Cohesion: 0.24
Nodes (5): createApp(), CaseController, BaseController, HttpContext, HttpResult

### Community 21 - "Codex Chat Gateway"
Cohesion: 0.17
Nodes (7): approvalDecline(), CodexAppServerClient, extractNotificationError(), extractRpcError(), extractTurnError(), JsonObject, OUTPUT_SCHEMA

### Community 22 - "DEKEL Estimate Preview"
Cohesion: 0.17
Nodes (22): buildCaseEstimatePreview(), buildPreferredSewerFamilies(), buildPreviewCandidateFingerprint(), CaseDekelEstimatePreviewLine, classifySewerPreviewFamily(), extractExplicitAreaQuantity(), extractExplicitDiscreteQuantity(), extractExplicitLinearQuantity() (+14 more)

### Community 23 - "Document Policy References"
Cohesion: 0.12
Nodes (20): Controlled Estimate Pipeline, MASHMAUET Technical Specification, Ancillary Works Policy, Controlled Ancillary Inclusion, Masmach Section Contracts, Required Output Sections, Quantity Rule Matrix, Strongest Available Quantity (+12 more)

### Community 24 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): ES2022, node, src/**/*.ts, tests/**/*.ts, compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames (+10 more)

### Community 25 - "Case Draft Assembly"
Cohesion: 0.22
Nodes (19): createEmptyAnalysisSnapshot(), buildCaseOutputDraft(), buildCaseOutputPackage(), buildCaseRecord(), buildPipeline(), buildSelectedMavnadimSelection(), testCaseOutputDraftBuilder(), testCaseOutputDraftUsesCompactScopeFragmentsWithoutConfirmedDekelLines() (+11 more)

### Community 26 - "Case Service Operations"
Cohesion: 0.18
Nodes (14): ClarificationQuestion, SelectedMavnadimItem, applyClarificationAnswer(), buildSupportingEvidenceRecord(), inferSupportingEvidenceConfidence(), inferSupportingEvidenceFormat(), inferSupportingEvidenceRole(), mergeClarifiedDescription() (+6 more)

### Community 27 - "Contract Specification Framework"
Cohesion: 0.17
Nodes (16): Contract Administration and Measurement, Government Construction Contract 3210, General Specification Chapter 00, Preliminaries and Price Inclusion Rules, Earthwork Measurement and Execution, General Specification Chapter 01, Current General Specification Editions, Blue Book Publication Table 2026 (+8 more)

### Community 28 - "Output Export Pipeline"
Cohesion: 0.23
Nodes (12): GeneratedArtifact, buildArtifact(), buildDetailedCostSheetCsv(), buildMainDocumentMarkdown(), buildReviewSheetMarkdown(), CaseOutputExportManifest, CaseOutputExportService, csvEscape() (+4 more)

### Community 29 - "Request Input Validation"
Cohesion: 0.32
Nodes (14): isRecord(), optionalPositiveNumber(), optionalString(), requireRecommendationKey(), requireString(), validateCaseClarificationSubmissionInput(), validateCaseCreateInput(), validateCaseDekelSelectionInput() (+6 more)

### Community 30 - "Material Extraction Tests"
Cohesion: 0.21
Nodes (5): LocalMaterial, parseCodexAnswer(), extractMaterial(), extractPdf(), limitText()

### Community 31 - "DEKEL Routing"
Cohesion: 0.18
Nodes (13): buildDekelCandidateMatches(), buildDekelCandidateMatchesForCase(), buildRouteCandidates(), buildRouteReason(), getTokenWeight(), inferItemChapterCode(), normalizeChapterCode(), testDekelMatchingChapterPreference() (+5 more)

### Community 32 - "MAVNADIM Catalog"
Cohesion: 0.26
Nodes (5): MavnadimCatalogItem, MavnadimCatalogSummary, mavnadimCatalogItems, MavnadimCatalogService, MavnadimMatchingService

### Community 33 - "Financial Calculation Rules"
Cohesion: 0.40
Nodes (9): allocateVatByLargestRemainder(), buildFinancialAudit(), calculateBoq(), calculateProjectSummary(), FEE_ROWS, groupEstimate(), roundMoney(), VAT_RATE (+1 more)

### Community 34 - "Local Request Security"
Cohesion: 0.31
Nodes (9): enforceLocalRequestSecurity(), isLoopbackHostname(), isLoopbackOrigin(), normalizeHostname(), setSecurityHeaders(), currentDirectory, publicDirectory, publicFiles (+1 more)

### Community 35 - "Skill Governance"
Cohesion: 0.22
Nodes (10): Skill Audit and Fallback, Skill Execution Policy, Production Skill Ecosystem, Skill Manager, Skill Registry, Deterministic Skill Router, General Skills SOP, Project-Local Skill Layer (+2 more)

### Community 36 - "Quantity Extraction"
Cohesion: 0.29
Nodes (10): buildSewerDescriptorSuffix(), detectInlineGeometry(), detectWorkItems(), extractExplicitAreaQuantity(), extractExplicitDepthMeters(), extractExplicitDiameterMm(), extractExplicitLinearQuantity(), extractExplicitUnitQuantity() (+2 more)

### Community 37 - "Blue Book Work Types"
Cohesion: 0.25
Nodes (8): בטיחות מיכלים, שילוט ואחזקה, דף תיקון למערכות גילוי וכיבוי אש, מערכות גילוי עשן וכיבוי אוטומטי, מפרט מערכות גילוי וכיבוי אש, BMS, ממשקים ואבטחת סייבר, מפרט בקרת מערכות במתקן, מפרט מערכת דיזל-גנרטור, גנרטור, דלק, אוורור ופליטה

### Community 38 - "Infrastructure Work Specifications"
Cohesion: 0.25
Nodes (8): שיקום נופי, משטחים ומתקני חוץ, מפרט פיתוח נופי, מילוי, שריון וחזית קיר התמך, מפרט קירות תמך מקרקע משוריינת, מפרט משטחי בטון, מישקים, גימור ואשפרת בטון, תשתיות, אספלט, בטון ובקרת סלילה, מפרט עבודות סלילה

### Community 39 - "MAVNADIM DEKEL Packaging"
Cohesion: 0.39
Nodes (7): DekelCandidateMatch, buildAncillaryQuery(), buildMavnadimDekelPackagePreview(), getRecommendationPriority(), MavnadimDekelPackagePreviewItem, orderRecommendations(), testMavnadimDekelPackagePreview()

### Community 40 - "Road Infrastructure Chapters"
Cohesion: 0.33
Nodes (6): משאבות, צנרת ולוחות פיקוד במקלטים, תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים, פרק 58/59 — מרחבים מוגנים ומקלטים, דרישות בנייה ומערכות למרחבים מוגנים, תיקון 2 לפרק 58/59 — החלפת תיקון 1, משאבות וניקוז למרחבים מוגנים לפי תיקון 2

### Community 41 - "Fabrication Specifications"
Cohesion: 0.50
Nodes (4): Carpentry and Steelwork Specification, Shop Drawings and Prototypes, Aluminium Work Specification, Fabrication, Glazing and Finishes

### Community 42 - "Blue Book Technical Chapters"
Cohesion: 0.50
Nodes (4): דף תיקון לקיבוע רעפים, דרישות התקנה וקיבוע רעפים, מפרט נגרות חרש וסיכוך, גגות, פרגולות ורצפות עץ

### Community 43 - "Blue Book Execution Rules"
Cohesion: 0.50
Nodes (4): מפרט עבודות גינון והשקיה, נטיעות ומערכות השקיה, מפרט אחזקת גנים, אחזקת צמחייה ומערכות השקיה

### Community 44 - "Upload Validation"
Cohesion: 0.67
Nodes (3): ALLOWED_EXTENSIONS, startsWith(), validateUploadedFile()

### Community 45 - "Clarification Policy"
Cohesion: 0.67
Nodes (3): No-Guessing Principle, Clarification and Review Gate, Source Priority Policy

## Knowledge Gaps
- **247 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+242 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `calculateProjectSummary()` connect `Financial Calculation Rules` to `Web Interface`, `Project Chat Context`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `LocalWorkspaceService` connect `Local Workspace API` to `Professional Knowledge Retrieval`, `DEKEL Pricebook Ingestion`, `Project Chat Context`, `Local Project Storage`, `Workspace Validation Logging`, `Application Composition`, `Material Extraction Tests`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `CodexAppServerClient` connect `Codex Chat Gateway` to `Application Composition`, `Local Workspace API`, `Material Extraction Tests`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `createApp()` (e.g. with `.analyzeCase()` and `.createCase()`) actually correct?**
  _`createApp()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _247 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.062173458725182866 - nodes in this community are weakly interconnected._
- **Should `Professional Knowledge Retrieval` be split into smaller, more focused modules?**
  _Cohesion score 0.06894049346879536 - nodes in this community are weakly interconnected._