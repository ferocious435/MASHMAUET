# Graph Report - MASHMAUET  (2026-08-21)

## Corpus Check
- 84 files · ~96,578 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1224 nodes · 2864 edges · 71 communities (43 shown, 28 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 227 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7a8501d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- professional-knowledge-service.ts
- openxml-dekel-reader.ts
- LocalWorkspaceService
- local-workspace-service.ts
- masmach-template-engine.ts
- createApp
- case-analysis-pipeline.ts
- LocalProjectStore
- local-workspace-controller.ts
- MASHMAUET Agent
- skill-orchestrator-service.ts
- Masonry Work Specification
- live-case-check.ts
- mavnadim-matching-service.ts
- run-tests.ts
- .analyzeMaterial
- create-app.ts
- scripts
- case-schemas.ts
- server.ts
- CodexAppServerClient
- dekel-case-estimate-service.ts
- Text Policy Matrix
- compilerOptions
- playwright.config.ts
- Blue Book Publication Table 2026
- local-workspace.test.ts
- calculations.js
- setSecurityHeaders
- Production Skill Ecosystem
- detectWorkItems
- מפרט מערכות גילוי וכיבוי אש
- מפרט פיתוח נופי
- תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים
- Shop Drawings and Prototypes
- דף תיקון לקיבוע רעפים
- מפרט עבודות גינון והשקיה
- material-upload-validator.ts
- Clarification and Review Gate
- calculations.d.ts
- Chapter 04 Correction, August 1997
- Painting Work Specification
- כבילה, מובלים וחדרי תקשורת
- ייצור וריתוך קונסטרוקציות פלדה
- ייצור והרכבת רכיבים טרומים
- מפרט רכיבים מתועשים בבניין
- שיטות קידוח ויציקת כלונסאות
- קידוח, דיוס ומתיחת עוגנים
- מפרט מתקני אוויר דחוס
- מפרט גזים ונוזלים בלחץ גבוה
- פרק 54 — מפרט כללי לעבודות מנהור
- מדידה, בדיקות ובקרת צנרת
- Asbestos-Cement Lines Cancellation
- איכות ובדיקות חומרי שכבות מגן
- ייצור, התקנה ובדיקת מסגרות מגן
- פרק 67 — מתקני פלדה נושאי אנטנות
- פרק 81 — BIM לניהול, תיאום וביצוע
- פרק 97 — בטיחות בעבודות בנייה
- מקרה בוחן — החלפת קו ביוב במחנה
- תיקון תוואי, הנחת תשתית חדשה והשלמת הפרויקט
- 200 מטר, עומק 2 מטר, קוטר 160 מ״מ
- כתב כמויות לדוגמה
- שיפוץ מבנים, תשתיות וגמרים
- שיפוץ כיתות לימוד, פרוזדורים ומדרגות
- הסדרת מחפורת, תעלות ניקוז וקו מתח גבוה
- Project, document and Codex chat interface

## God Nodes (most connected - your core abstractions)
1. `main()` - 50 edges
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
- `Skill Execution Policy` --semantically_similar_to--> `Skill Governance Gates`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/SKILLS DOWNLOAD.md.txt → PROJECT-SKILLS.md
- `No-Guessing Principle` --semantically_similar_to--> `Clarification and Review Gate`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/PRD.md.txt → PRD.md
- `Archived Technical Assignment Pointer` --conceptually_related_to--> `MASHMAUET Agent`  [INFERRED]
  TZ.md.txt → PRD.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Context-Bounded Professional Retrieval** — readme_professional_reference_search, docs_backend_runbook_reference_only_corpora, docs_backend_runbook_knowledge_cache, docs_architecture_adr_001_professional_reference_retrieval_professional_knowledge_service, docs_architecture_adr_001_professional_reference_retrieval_applicability_boundary [EXTRACTED 1.00]
- **Controlled Case to Traceable Document** — prd_controlled_case_pipeline, prd_dekel_pricebook, prd_mavnadim_catalog, prd_clarification_and_review_gate, prd_traceable_output_package [EXTRACTED 1.00]
- **Israeli Government Construction Document Framework** — homer_3210_2019_government_contract_3210, homer_blue_book_1_1_2026_publication_table, homer_blue_book_2006_engineering_contract_documents, homer_blue_book_00_2009_general_specification_00, homer_blue_book_01_2011_general_specification_01, homer_blue_book_55_2000_general_specification_55 [EXTRACTED 1.00]
- **MASHMAUET Product Delivery System** — docs_reference_process_general_skills_sop_automated_skill_orchestration, docs_reference_product_backlog_mvp_hardening_queue, docs_reference_product_roadmap_six_phase_delivery [INFERRED 0.75]
- **MASHMAUET Controlled Output Governance** — docs_reference_policies_ancillary_works_policy_controlled_ancillary_inclusion, docs_reference_policies_quantity_rule_matrix_strongest_available_quantity, docs_reference_policies_text_policy_matrix_source_grounded_wording, docs_reference_policies_masmach_section_contracts_required_output_sections [INFERRED 0.85]
- **Governed Skill Orchestration** — project_skills_project_skill_layer, docs_archive_source_inputs_skills_download_md_skill_registry, docs_archive_source_inputs_skills_download_md_skill_manager, docs_archive_source_inputs_skills_download_md_skill_router, docs_archive_source_inputs_skills_download_md_execution_policy, docs_archive_source_inputs_skills_download_md_audit_and_fallback [INFERRED 0.95]

## Communities (71 total, 28 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.05
Nodes (96): a4LayoutIssues, addChatMessage(), analyzeDekelReview(), backupKindLabel(), boqRow(), buildEvidenceChatContext(), buildEvidenceIndex(), canvasToJpeg() (+88 more)

### Community 1 - "professional-knowledge-service.ts"
Cohesion: 0.07
Nodes (33): buildExpandedTerms(), buildSource(), CachedPdf, CHAPTER_TERMS, chunkPage(), deduplicateResults(), detectChapterCodes(), detectIntents() (+25 more)

### Community 2 - "openxml-dekel-reader.ts"
Cohesion: 0.09
Nodes (36): dekelExpectedHeaders, DekelWorkbookColumnMap, DekelWorkbookRow, PricebookItem, DekelCatalogService, DekelWorkbookSummary, DekelEstimatePreview, DekelEstimatePreviewLine (+28 more)

### Community 3 - "LocalWorkspaceService"
Cohesion: 0.24
Nodes (4): LocalDekelReview, PublicLocalProject, toPublicProject(), LocalWorkspaceService

### Community 4 - "local-workspace-service.ts"
Cohesion: 0.08
Nodes (38): KeyedMutex, ChatProposal, LocalDekelCandidate, LocalDekelReviewLine, LocalFinancialAudit, ProjectChatMessage, PublicLocalMaterial, ALLOWED_DOCUMENT_PATHS (+30 more)

### Community 5 - "masmach-template-engine.ts"
Cohesion: 0.10
Nodes (37): CaseOutputDraft, roundMoney(), buildAppendicesSection(), buildBackgroundSection(), buildBackgroundSectionV2(), buildBudgetBreakdownSection(), buildMasmachTemplateDocument(), buildObjectiveSection() (+29 more)

### Community 6 - "createApp"
Cohesion: 0.10
Nodes (16): createApp(), CaseController, CaseRecord, SelectedDekelLine, SelectedMavnadimItem, CaseRepository, InMemoryCaseRepository, appendManualTrace() (+8 more)

### Community 7 - "case-analysis-pipeline.ts"
Cohesion: 0.08
Nodes (37): AggregatedTemplateLine, CandidateMatch, DetailedCostLine, DetectedGeometry, DimensionInput, MatchType, PipelineStage, PipelineStageState (+29 more)

### Community 8 - "LocalProjectStore"
Cohesion: 0.13
Nodes (10): DEFAULT_DOCUMENT, ensureDocumentEvidence(), exists(), isLocalDekelReview(), LocalProjectStore, migrateProject(), validateProjectsDirectory(), LocalBackupManifest (+2 more)

### Community 9 - "local-workspace-controller.ts"
Cohesion: 0.08
Nodes (29): LocalAppConfig, decodeFileName(), LocalRateLimiter, LocalWorkspaceController, normalizeMaterialContentType(), readBinary(), readJson(), routeLabel() (+21 more)

### Community 10 - "MASHMAUET Agent"
Cohesion: 0.07
Nodes (35): Ancillary Works Policy, Product Backlog, Project Applicability Boundary, Hybrid Lexical and Metadata Ranking, Lazy Local Retrieval, ProfessionalKnowledgeService, Semantic Index Revisit Condition, Engineering Calculation Document System (+27 more)

### Community 11 - "skill-orchestrator-service.ts"
Cohesion: 0.08
Nodes (23): buildBaseSkillSource(), dedupe(), getScopeKey(), getTaskDefinition(), GovernanceConfig, isFileNotFoundError(), isRecord(), RegistryConfig (+15 more)

### Community 12 - "Masonry Work Specification"
Cohesion: 0.07
Nodes (34): Cast-in-Place Concrete Specification, Concrete Quality Control, Precast Concrete Components, Precast Erection and Tolerances, Masonry Materials and Joints, Masonry Work Specification, Waterproofing Specification, Waterproofing Systems and Tests (+26 more)

### Community 13 - "live-case-check.ts"
Cohesion: 0.11
Nodes (32): asArray(), asObject(), asStringArray(), buildCasePayload(), buildObservations(), buildReport(), buildTimestampSlug(), deriveDescriptionFromSupportingEvidence() (+24 more)

### Community 14 - "mavnadim-matching-service.ts"
Cohesion: 0.09
Nodes (35): MavnadimAncillaryRecommendation, MavnadimCandidateMatch, MavnadimCatalogAddon, MavnadimCatalogItem, MavnadimCatalogSummary, mavnadimCatalogItems, MavnadimCatalogService, buildMavnadimAncillaryRecommendations() (+27 more)

### Community 15 - "run-tests.ts"
Cohesion: 0.05
Nodes (98): createEmptyAnalysisSnapshot(), WorkItem, buildCaseOutputDraft(), buildCaseOutputPackage(), roundMoney(), buildCaseEstimatePreviewFromDekelCandidates(), buildDekelEstimatePreview(), buildDekelCandidateMatches() (+90 more)

### Community 16 - ".analyzeMaterial"
Cohesion: 0.22
Nodes (3): CodexGateway, buildMaterialAnalysisPrompt(), parseCodexAnswer()

### Community 17 - "create-app.ts"
Cohesion: 0.12
Nodes (18): executeRoutedRequest(), MashmauetApplication, readJsonBody(), sendJson(), summarizeForRoute(), toHttpResult(), caseRoutes, CaseOutputExportService (+10 more)

### Community 18 - "scripts"
Cohesion: 0.06
Nodes (34): @fix-webm-duration/fix, mammoth, @napi-rs/canvas, @openai/codex, dependencies, mammoth, @napi-rs/canvas, @openai/codex (+26 more)

### Community 19 - "case-schemas.ts"
Cohesion: 0.05
Nodes (72): CaseAnalysisSnapshot, CaseClarificationAnswerInput, CaseClarificationSubmissionInput, CaseCreateInput, CaseDekelSelectionInput, CaseDekelSelectionInputLine, CaseMavnadimAncillarySelectionInput, CaseMavnadimAncillarySelectionInputLine (+64 more)

### Community 20 - "server.ts"
Cohesion: 0.32
Nodes (5): integerFromEnvironment(), loadLocalAppConfig(), app, config, server

### Community 21 - "CodexAppServerClient"
Cohesion: 0.17
Nodes (7): approvalDecline(), CodexAppServerClient, extractNotificationError(), extractRpcError(), extractTurnError(), JsonObject, OUTPUT_SCHEMA

### Community 22 - "dekel-case-estimate-service.ts"
Cohesion: 0.17
Nodes (22): buildCaseEstimatePreview(), buildPreferredSewerFamilies(), buildPreviewCandidateFingerprint(), CaseDekelEstimatePreviewLine, classifySewerPreviewFamily(), extractExplicitAreaQuantity(), extractExplicitDiscreteQuantity(), extractExplicitLinearQuantity() (+14 more)

### Community 23 - "Text Policy Matrix"
Cohesion: 0.12
Nodes (20): Controlled Estimate Pipeline, MASHMAUET Technical Specification, Ancillary Works Policy, Controlled Ancillary Inclusion, Masmach Section Contracts, Required Output Sections, Quantity Rule Matrix, Strongest Available Quantity (+12 more)

### Community 24 - "compilerOptions"
Cohesion: 0.11
Nodes (18): ES2022, node, src/**/*.ts, tests/**/*.ts, compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames (+10 more)

### Community 27 - "Blue Book Publication Table 2026"
Cohesion: 0.17
Nodes (16): Contract Administration and Measurement, Government Construction Contract 3210, General Specification Chapter 00, Preliminaries and Price Inclusion Rules, Earthwork Measurement and Execution, General Specification Chapter 01, Current General Specification Editions, Blue Book Publication Table 2026 (+8 more)

### Community 30 - "local-workspace.test.ts"
Cohesion: 0.23
Nodes (4): LocalMaterial, extractMaterial(), extractPdf(), limitText()

### Community 33 - "calculations.js"
Cohesion: 0.35
Nodes (12): allocateVatByLargestRemainder(), buildFinancialAudit(), calculateBoq(), calculateProjectSummary(), FEE_ROWS, groupEstimate(), moneyAtRate(), moneyToCents() (+4 more)

### Community 34 - "setSecurityHeaders"
Cohesion: 0.31
Nodes (9): enforceLocalRequestSecurity(), isLoopbackHostname(), isLoopbackOrigin(), normalizeHostname(), setSecurityHeaders(), currentDirectory, publicDirectory, publicFiles (+1 more)

### Community 35 - "Production Skill Ecosystem"
Cohesion: 0.22
Nodes (10): Skill Audit and Fallback, Skill Execution Policy, Production Skill Ecosystem, Skill Manager, Skill Registry, Deterministic Skill Router, General Skills SOP, Project-Local Skill Layer (+2 more)

### Community 36 - "detectWorkItems"
Cohesion: 0.39
Nodes (8): buildSewerDescriptorSuffix(), detectWorkItems(), extractExplicitAreaQuantity(), extractExplicitDepthMeters(), extractExplicitDiameterMm(), extractExplicitLinearQuantity(), extractExplicitUnitQuantity(), parsePositiveQuantity()

### Community 37 - "מפרט מערכות גילוי וכיבוי אש"
Cohesion: 0.25
Nodes (8): בטיחות מיכלים, שילוט ואחזקה, דף תיקון למערכות גילוי וכיבוי אש, מערכות גילוי עשן וכיבוי אוטומטי, מפרט מערכות גילוי וכיבוי אש, BMS, ממשקים ואבטחת סייבר, מפרט בקרת מערכות במתקן, מפרט מערכת דיזל-גנרטור, גנרטור, דלק, אוורור ופליטה

### Community 38 - "מפרט פיתוח נופי"
Cohesion: 0.25
Nodes (8): שיקום נופי, משטחים ומתקני חוץ, מפרט פיתוח נופי, מילוי, שריון וחזית קיר התמך, מפרט קירות תמך מקרקע משוריינת, מפרט משטחי בטון, מישקים, גימור ואשפרת בטון, תשתיות, אספלט, בטון ובקרת סלילה, מפרט עבודות סלילה

### Community 40 - "תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים"
Cohesion: 0.33
Nodes (6): משאבות, צנרת ולוחות פיקוד במקלטים, תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים, פרק 58/59 — מרחבים מוגנים ומקלטים, דרישות בנייה ומערכות למרחבים מוגנים, תיקון 2 לפרק 58/59 — החלפת תיקון 1, משאבות וניקוז למרחבים מוגנים לפי תיקון 2

### Community 41 - "Shop Drawings and Prototypes"
Cohesion: 0.50
Nodes (4): Carpentry and Steelwork Specification, Shop Drawings and Prototypes, Aluminium Work Specification, Fabrication, Glazing and Finishes

### Community 42 - "דף תיקון לקיבוע רעפים"
Cohesion: 0.50
Nodes (4): דף תיקון לקיבוע רעפים, דרישות התקנה וקיבוע רעפים, מפרט נגרות חרש וסיכוך, גגות, פרגולות ורצפות עץ

### Community 43 - "מפרט עבודות גינון והשקיה"
Cohesion: 0.50
Nodes (4): מפרט עבודות גינון והשקיה, נטיעות ומערכות השקיה, מפרט אחזקת גנים, אחזקת צמחייה ומערכות השקיה

### Community 44 - "material-upload-validator.ts"
Cohesion: 0.67
Nodes (3): ALLOWED_EXTENSIONS, startsWith(), validateUploadedFile()

### Community 45 - "Clarification and Review Gate"
Cohesion: 0.67
Nodes (3): No-Guessing Principle, Clarification and Review Gate, Source Priority Policy

## Knowledge Gaps
- **255 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+250 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `calculateProjectSummary()` connect `calculations.js` to `app.js`, `local-workspace-service.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `LocalWorkspaceService` connect `LocalWorkspaceService` to `professional-knowledge-service.ts`, `openxml-dekel-reader.ts`, `local-workspace-service.ts`, `LocalProjectStore`, `local-workspace-controller.ts`, `.analyzeMaterial`, `create-app.ts`, `local-workspace.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `LocalProjectStore` connect `LocalProjectStore` to `LocalWorkspaceService`, `local-workspace-service.ts`, `local-workspace-controller.ts`, `create-app.ts`, `local-workspace.test.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `createApp()` (e.g. with `.analyzeCase()` and `.createCase()`) actually correct?**
  _`createApp()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _255 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05313131313131313 - nodes in this community are weakly interconnected._
- **Should `professional-knowledge-service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06894049346879536 - nodes in this community are weakly interconnected._