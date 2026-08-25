# Graph Report - MASHMAUET  (2026-08-25)

## Corpus Check
- 90 files · ~115,796 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1483 nodes · 3431 edges · 99 communities (69 shown, 30 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 290 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `745b4265`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- local-workspace-service.ts
- media-audio-transcription.ts
- case-analysis-pipeline.ts
- openxml-dekel-reader.ts
- LocalProjectStore
- dekel-matching-service.ts
- CaseService
- case-schemas.ts
- LocalWorkspaceService
- run-tests.ts
- local-workspace-api.test.ts
- mavnadim-matching-service.ts
- createApp
- local-workspace-controller.ts
- scripts
- Masonry Work Specification
- live-case-check.ts
- masmach-template-engine.ts
- professional-knowledge-service.ts
- app.js
- skill-orchestrator-service.ts
- create-app.ts
- requestJson
- escapeHtml
- case-service.ts
- CodexAppServerClient
- dekel-case-estimate-service.ts
- local-project-types.ts
- buildCaseRecord
- isRecord
- MASHMAUET Agent
- Text Policy Matrix
- compilerOptions
- showToast
- .chat
- Local Backend Runbook
- Blue Book Publication Table 2026
- calculateProjectSummary
- renderDocument
- buildDekelCandidateMatches
- mock-local-api.ts
- getActiveProject
- document-layout.js
- Production Skill Ecosystem
- Controlled Case-Analysis Pipeline
- DEKEL Global Pricebook
- Local Media Tools
- מפרט מערכות גילוי וכיבוי אש
- מפרט פיתוח נופי
- Local Workspace Shell
- Verify Job
- Superficial Document Root Cause
- server.ts
- תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים
- CodexGateway
- ProfessionalKnowledgeService
- Q: Почему после загрузки фото и видео локальная система показала поверхностный шаблонный документ и не создала глубокую реальную смету?
- Shop Drawings and Prototypes
- דף תיקון לקיבוע רעפים
- מפרט עבודות גינון והשקיה
- Clarification and Review Gate
- Reference-Only Professional Retrieval
- playwright.config.ts
- calculations.d.ts
- THIRD-PARTY-MEDIA.md
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
- Evidence Confidence Policy
- Explicit Confirmation Dialog
- detectWorkItems
- buildDekelCandidateMatchesForCase

## God Nodes (most connected - your core abstractions)
1. `LocalWorkspaceService` - 54 edges
2. `main()` - 52 edges
3. `createApp()` - 40 edges
4. `LocalProjectStore` - 39 edges
5. `CaseService` - 34 edges
6. `CaseRecord` - 28 edges
7. `escapeHtml()` - 26 edges
8. `CaseController` - 23 edges
9. `PublicLocalProject` - 21 edges
10. `buildDekelCandidateMatches()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Persistent Local Project Storage` --semantically_similar_to--> `Local Data Layout`  [INFERRED] [semantically similar]
  README.md → docs/BACKEND-RUNBOOK.md
- `Project-Local Skill Layer` --semantically_similar_to--> `Production Skill Ecosystem`  [INFERRED] [semantically similar]
  PROJECT-SKILLS.md → docs/archive/source-inputs/SKILLS DOWNLOAD.md.txt
- `Pricing Completeness State` --conceptually_related_to--> `DEKEL Financial Audit`  [INFERRED]
  public/calculations.js → README.md
- `Unresolved Versus Owner-Excluded DEKEL State` --semantically_similar_to--> `Automatic DEKEL Blocker Policy`  [INFERRED] [semantically similar]
  public/app.js → src/modules/local-workspace/local-workspace-service.ts
- `Hidden Works Library` --semantically_similar_to--> `Ancillary Works Policy`  [INFERRED] [semantically similar]
  docs/archive/source-inputs/RAAEN.md.txt → ANCILLARY-WORKS-POLICY.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Context-Bounded Professional Retrieval** — docs_backend_runbook_knowledge_cache, docs_architecture_adr_001_professional_reference_retrieval_professional_knowledge_service, docs_architecture_adr_001_professional_reference_retrieval_applicability_boundary [EXTRACTED 1.00]
- **Controlled Case to Traceable Document** — prd_controlled_case_pipeline, prd_dekel_pricebook, prd_mavnadim_catalog, prd_clarification_and_review_gate, prd_traceable_output_package [EXTRACTED 1.00]
- **Israeli Government Construction Document Framework** — homer_3210_2019_government_contract_3210, homer_blue_book_1_1_2026_publication_table, homer_blue_book_2006_engineering_contract_documents, homer_blue_book_00_2009_general_specification_00, homer_blue_book_01_2011_general_specification_01, homer_blue_book_55_2000_general_specification_55 [EXTRACTED 1.00]
- **MASHMAUET Product Delivery System** — docs_reference_process_general_skills_sop_automated_skill_orchestration, docs_reference_product_backlog_mvp_hardening_queue, docs_reference_product_roadmap_six_phase_delivery [INFERRED 0.75]
- **Local Project Evidence Flow** — readme_multimodal_runtime_intake, docs_backend_runbook_material_derivatives, public_index_materials_ui, public_index_processing_workflow_ui, graphify_out_memory_query_20260823_092806_separate_material_analysis [INFERRED 0.85]
- **MASHMAUET Controlled Output Governance** — docs_reference_policies_ancillary_works_policy_controlled_ancillary_inclusion, docs_reference_policies_quantity_rule_matrix_strongest_available_quantity, docs_reference_policies_text_policy_matrix_source_grounded_wording, docs_reference_policies_masmach_section_contracts_required_output_sections [INFERRED 0.85]
- **Reliability and Integrity Controls** — _github_workflows_ci_npm_check, _github_workflows_ci_playwright_e2e, docs_backend_runbook_quick_diagnostics, docs_backend_runbook_safe_restore, docs_third_party_media_sha256_verification [INFERRED 0.85]
- **DEKEL Pricing Governance** — readme_dekel_pricebook, readme_dekel_financial_audit, docs_backend_runbook_dekel_governance, docs_backend_runbook_dekel_review_session, public_index_dekel_review_ui, graphify_out_memory_query_20260823_092806_dekel_example_matching [INFERRED 0.95]
- **Governed Skill Orchestration** — project_skills_project_skill_layer, docs_archive_source_inputs_skills_download_md_skill_registry, docs_archive_source_inputs_skills_download_md_skill_manager, docs_archive_source_inputs_skills_download_md_skill_router, docs_archive_source_inputs_skills_download_md_execution_policy, docs_archive_source_inputs_skills_download_md_audit_and_fallback [INFERRED 0.95]

## Communities (99 total, 30 thin omitted)

### Community 0 - "local-workspace-service.ts"
Cohesion: 0.07
Nodes (54): KeyedMutex, Semantic DEKEL Selection Metadata, ALLOWED_DOCUMENT_PATHS, applyDekelBillingQuantityRule(), applyDekelReviewToDocument(), applyVerifiedDekelSelectionsToDocument(), assertGeneratedDocument(), Automatic DEKEL Blocker Policy (+46 more)

### Community 1 - "media-audio-transcription.ts"
Cohesion: 0.08
Nodes (37): assertDirectory(), assertExecutable(), AudioTranscript, buildSafeSpawnOptions(), CachedAudioTranscriptValidationInput, CachedAudioTranscriptValidationResult, failed(), finiteNumber() (+29 more)

### Community 2 - "case-analysis-pipeline.ts"
Cohesion: 0.08
Nodes (38): AggregatedTemplateLine, CandidateMatch, DetailedCostLine, DetectedGeometry, MatchType, PipelineStage, PipelineStageState, aggregateTemplateLines() (+30 more)

### Community 3 - "openxml-dekel-reader.ts"
Cohesion: 0.09
Nodes (36): dekelExpectedHeaders, DekelWorkbookColumnMap, DekelWorkbookRow, PricebookItem, DekelCatalogService, DekelWorkbookSummary, buildDekelEstimatePreview(), DekelEstimatePreview (+28 more)

### Community 4 - "LocalProjectStore"
Cohesion: 0.15
Nodes (4): exists(), LocalProjectStore, LocalBackupManifest, LocalProject

### Community 5 - "dekel-matching-service.ts"
Cohesion: 0.07
Nodes (44): buildDekelSearchQueryPlan(), buildRouteCandidates(), buildWorkItemSearchQuery(), calculateRouteAdjustment(), calculateWorkTypeSemanticAdjustment(), candidateExplicitlyExcludesRequestedWork(), chapterRoutingRules, containsAny() (+36 more)

### Community 6 - "CaseService"
Cohesion: 0.14
Nodes (11): CaseRecord, SelectedDekelLine, CaseRepository, InMemoryCaseRepository, appendManualTrace(), CaseService, buildCaseEstimatePreviewFromSelectedDekelLines(), CaseDekelEstimatePreview (+3 more)

### Community 7 - "case-schemas.ts"
Cohesion: 0.08
Nodes (31): CaseClarificationAnswerInput, CaseClarificationSubmissionInput, CaseCreateInput, CaseDekelSelectionInput, CaseDekelSelectionInputLine, CaseMavnadimAncillarySelectionInput, CaseMavnadimAncillarySelectionInputLine, CaseMavnadimSelectionInput (+23 more)

### Community 8 - "LocalWorkspaceService"
Cohesion: 0.17
Nodes (12): LocalDekelReview, PublicLocalProject, toPublicProject(), assertProcessingAccess(), assertProcessingIdle(), buildMaterialAnalysisPrompt(), fingerprintDocument(), invalidateProcessing() (+4 more)

### Community 9 - "run-tests.ts"
Cohesion: 0.12
Nodes (36): buildCaseEstimatePreviewFromDekelCandidates(), readDekelRowsFromExtractedWorkbook(), buildPipelineWithLiveDekelFallback(), buildPipelineWithMissingReferences(), buildStoredZip(), computeCrc32(), crc32Table, createFixtureDekelXlsx() (+28 more)

### Community 10 - "local-workspace-api.test.ts"
Cohesion: 0.08
Nodes (18): AudioTranscriptionResult, MediaProbeResult, ProfessionalKnowledgeContext, BatchedEvidenceProjectBuildingCodex, BlockingProjectBuildingCodex, CapturingCodex, closeServer(), EmptyKnowledge (+10 more)

### Community 11 - "mavnadim-matching-service.ts"
Cohesion: 0.10
Nodes (31): MavnadimAncillaryRecommendation, MavnadimCandidateMatch, MavnadimCatalogAddon, MavnadimCatalogItem, MavnadimCatalogSummary, mavnadimCatalogItems, MavnadimCatalogService, buildMavnadimAncillaryRecommendations() (+23 more)

### Community 12 - "createApp"
Cohesion: 0.24
Nodes (5): createApp(), CaseController, BaseController, HttpContext, HttpResult

### Community 13 - "local-workspace-controller.ts"
Cohesion: 0.07
Nodes (39): blankDocument(), DEMO_DOCUMENT, ensureDocumentEvidence(), isLegacyDemoRows(), isLocalDekelReview(), migrateProcessing(), migrateProject(), validateProjectsDirectory() (+31 more)

### Community 14 - "scripts"
Cohesion: 0.06
Nodes (34): @fix-webm-duration/fix, mammoth, @napi-rs/canvas, @openai/codex, dependencies, mammoth, @napi-rs/canvas, @openai/codex (+26 more)

### Community 15 - "Masonry Work Specification"
Cohesion: 0.07
Nodes (34): Cast-in-Place Concrete Specification, Concrete Quality Control, Precast Concrete Components, Precast Erection and Tolerances, Masonry Materials and Joints, Masonry Work Specification, Waterproofing Specification, Waterproofing Systems and Tests (+26 more)

### Community 16 - "live-case-check.ts"
Cohesion: 0.11
Nodes (32): asArray(), asObject(), asStringArray(), buildCasePayload(), buildObservations(), buildReport(), buildTimestampSlug(), deriveDescriptionFromSupportingEvidence() (+24 more)

### Community 17 - "masmach-template-engine.ts"
Cohesion: 0.07
Nodes (49): GeneratedArtifact, CaseOutputDraft, roundMoney(), buildArtifact(), buildDetailedCostSheetCsv(), buildMainDocumentMarkdown(), buildReviewSheetMarkdown(), CaseOutputExportManifest (+41 more)

### Community 18 - "professional-knowledge-service.ts"
Cohesion: 0.12
Nodes (25): buildExpandedTerms(), buildSource(), CachedPdf, CHAPTER_TERMS, chunkPage(), deduplicateResults(), detectChapterCodes(), detectIntents() (+17 more)

### Community 19 - "app.js"
Cohesion: 0.10
Nodes (25): a4LayoutIssues, buildEvidenceChatContext(), createBlankDocumentTemplate(), createDefaultProject(), dateFormatter, documentPathLabel(), elements, evidenceConfidenceLabel() (+17 more)

### Community 20 - "skill-orchestrator-service.ts"
Cohesion: 0.09
Nodes (21): buildBaseSkillSource(), dedupe(), getScopeKey(), getTaskDefinition(), GovernanceConfig, isFileNotFoundError(), isRecord(), RegistryConfig (+13 more)

### Community 21 - "create-app.ts"
Cohesion: 0.10
Nodes (26): executeRoutedRequest(), MashmauetApplication, readJsonBody(), sendJson(), summarizeForRoute(), toHttpResult(), enforceLocalRequestSecurity(), isLoopbackHostname() (+18 more)

### Community 22 - "requestJson"
Cohesion: 0.14
Nodes (22): canvasToJpeg(), connectCodex(), createDefaultEvidenceNote(), createDocumentTemplate(), ensureDocumentEvidence(), expandLegacyBoqDescriptions(), handleFiles(), pollProjectProcessing() (+14 more)

### Community 23 - "escapeHtml"
Cohesion: 0.13
Nodes (27): backupKindLabel(), boqRow(), dekelQuantitySourceLabel(), dekelUnitCompatibilityLabel(), escapeAttribute(), escapeHtml(), formatDekelUnit(), formatMoney() (+19 more)

### Community 24 - "case-service.ts"
Cohesion: 0.12
Nodes (22): CaseAnalysisSnapshot, ClarificationQuestion, PipelineTraceEvent, SelectedMavnadimItem, applyClarificationAnswer(), buildSupportingEvidenceRecord(), inferSupportingEvidenceConfidence(), inferSupportingEvidenceFormat() (+14 more)

### Community 25 - "CodexAppServerClient"
Cohesion: 0.17
Nodes (7): approvalDecline(), CodexAppServerClient, extractNotificationError(), extractRpcError(), extractTurnError(), JsonObject, OUTPUT_SCHEMA

### Community 26 - "dekel-case-estimate-service.ts"
Cohesion: 0.17
Nodes (22): buildCaseEstimatePreview(), buildPreferredSewerFamilies(), buildPreviewCandidateFingerprint(), CaseDekelEstimatePreviewLine, classifySewerPreviewFamily(), extractExplicitAreaQuantity(), extractExplicitDiscreteQuantity(), extractExplicitLinearQuantity() (+14 more)

### Community 27 - "local-project-types.ts"
Cohesion: 0.13
Nodes (13): ChatProposal, LocalDekelCandidate, LocalDekelReviewLine, LocalFinancialAudit, LocalMaterial, LocalProjectProcessing, LocalProjectProcessingStage, LocalProjectProcessingStatus (+5 more)

### Community 28 - "buildCaseRecord"
Cohesion: 0.20
Nodes (21): createEmptyAnalysisSnapshot(), buildCaseOutputDraft(), buildCaseOutputPackage(), buildCaseRecord(), buildPipeline(), buildSelectedMavnadimSelection(), testCaseOutputDraftBuilder(), testCaseOutputDraftUsesCompactScopeFragmentsWithoutConfirmedDekelLines() (+13 more)

### Community 29 - "isRecord"
Cohesion: 0.32
Nodes (14): isRecord(), optionalPositiveNumber(), optionalString(), requireRecommendationKey(), requireString(), validateCaseClarificationSubmissionInput(), validateCaseCreateInput(), validateCaseDekelSelectionInput() (+6 more)

### Community 30 - "MASHMAUET Agent"
Cohesion: 0.12
Nodes (20): Ancillary Works Policy, Product Backlog, Engineering Calculation Document System, Pricebook-to-Template Mapping Table, Calculation Core and Document Layer, Engineering Calculation Document System Idea, Hidden Works Library, Masmach Section Contracts (+12 more)

### Community 31 - "Text Policy Matrix"
Cohesion: 0.12
Nodes (20): Controlled Estimate Pipeline, MASHMAUET Technical Specification, Ancillary Works Policy, Controlled Ancillary Inclusion, Masmach Section Contracts, Required Output Sections, Quantity Rule Matrix, Strongest Available Quantity (+12 more)

### Community 32 - "compilerOptions"
Cohesion: 0.11
Nodes (18): ES2022, node, src/**/*.ts, tests/**/*.ts, compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames (+10 more)

### Community 33 - "showToast"
Cohesion: 0.31
Nodes (9): analyzeDekelReview(), ensureA4LayoutReady(), ensureProjectReadyForExport(), exportHtml(), managementSkeleton(), openDekelReview(), runAction(), safeFileName() (+1 more)

### Community 34 - ".chat"
Cohesion: 0.16
Nodes (9): buildFinancialContext(), buildProfessionalKnowledgeQuery(), buildProposalContext(), buildRecentConversationContext(), chunkArray(), formatProfessionalKnowledgeContext(), parseCodexAnswer(), synthesisEvidencePromptDocument() (+1 more)

### Community 35 - "Local Backend Runbook"
Cohesion: 0.22
Nodes (11): Local Backend Runbook, Local Data Layout, Loopback-Only Local Service, Recoverable Project Archiving, Validated Backup Restore, Local Backend Security Limits, System and Backup Center UI, Local Application API (+3 more)

### Community 36 - "Blue Book Publication Table 2026"
Cohesion: 0.17
Nodes (16): Contract Administration and Measurement, Government Construction Contract 3210, General Specification Chapter 00, Preliminaries and Price Inclusion Rules, Earthwork Measurement and Execution, General Specification Chapter 01, Current General Specification Editions, Blue Book Publication Table 2026 (+8 more)

### Community 37 - "calculateProjectSummary"
Cohesion: 0.28
Nodes (14): allocateVatByLargestRemainder(), buildFinancialAudit(), calculateBoq(), calculateProjectSummary(), FEE_ROWS, groupEstimate(), moneyAtRate(), moneyToCents() (+6 more)

### Community 38 - "renderDocument"
Cohesion: 0.18
Nodes (14): buildEvidenceIndex(), fitDocumentPreview(), formatPercent(), narrativeSection(), Priced-Only BOQ Pagination, renderDocument(), renderScheduleTimeline(), renderUnpricedWorksNotice() (+6 more)

### Community 39 - "buildDekelCandidateMatches"
Cohesion: 0.20
Nodes (14): buildDekelCandidateMatches(), Expanded DEKEL Chapter Routing, getTokenWeight(), Hebrew Matching Normalization, inferDekelRoutingHints(), normalizeText(), preparedPricebookItemCache, preparePricebookItem() (+6 more)

### Community 40 - "mock-local-api.ts"
Cohesion: 0.28
Nodes (9): blankDocument(), fulfill(), installMockLocalApi(), MockProject, now(), processing(), project(), readyDocument() (+1 more)

### Community 41 - "getActiveProject"
Cohesion: 0.33
Nodes (11): addChatMessage(), findEvidenceMaterial(), getActiveProject(), initialize(), markChanged(), persistProject(), persistProjects(), renderAll() (+3 more)

### Community 42 - "document-layout.js"
Cohesion: 0.24
Nodes (10): measureA4Page(), readA4Layout(), refreshA4LayoutStatus(), scheduleA4LayoutCheck(), assessA4Document(), BOQ_PAGE_CAPACITY, BOQ_TOTALS_RESERVE, boqPageWeight() (+2 more)

### Community 43 - "Production Skill Ecosystem"
Cohesion: 0.22
Nodes (10): Skill Audit and Fallback, Skill Execution Policy, Production Skill Ecosystem, Skill Manager, Skill Registry, Deterministic Skill Router, General Skills SOP, Project-Local Skill Layer (+2 more)

### Community 44 - "Controlled Case-Analysis Pipeline"
Cohesion: 0.24
Nodes (10): Local-to-Production Pipeline Integration Gap, Production Cases API, Clarification Loop, Controlled Case-Analysis Pipeline, Generated Case Artifact Package, Evidence Assumption Fallback, Batched Evidence-Note Generation, Professional BOQ Synthesis Policy (+2 more)

### Community 45 - "DEKEL Global Pricebook"
Cohesion: 0.25
Nodes (9): DEKEL Pricebook Governance, Project DEKEL Review Session, Financial Reconciliation to Agora, DEKEL Review UI, DEKEL Financial Audit, DEKEL Global Pricebook, DEKEL Transformation Layer, MAVNADIM Modular Buildings Source (+1 more)

### Community 46 - "Local Media Tools"
Cohesion: 0.29
Nodes (8): Chronological Video Keyframes, FFmpeg Static Binaries b6.1.1, Bundled Media License Review, Local Media Tools, Pinned SHA-256 Verification, whisper.cpp v1.9.1, Whisper Model Files, Local Photo and Video Processing

### Community 47 - "מפרט מערכות גילוי וכיבוי אש"
Cohesion: 0.25
Nodes (8): בטיחות מיכלים, שילוט ואחזקה, דף תיקון למערכות גילוי וכיבוי אש, מערכות גילוי עשן וכיבוי אוטומטי, מפרט מערכות גילוי וכיבוי אש, BMS, ממשקים ואבטחת סייבר, מפרט בקרת מערכות במתקן, מפרט מערכת דיזל-גנרטור, גנרטור, דלק, אוורור ופליטה

### Community 48 - "מפרט פיתוח נופי"
Cohesion: 0.25
Nodes (8): שיקום נופי, משטחים ומתקני חוץ, מפרט פיתוח נופי, מילוי, שריון וחזית קיר התמך, מפרט קירות תמך מקרקע משוריינת, מפרט משטחי בטון, מישקים, גימור ואשפרת בטון, תשתיות, אספלט, בטון ובקרת סלילה, מפרט עבודות סלילה

### Community 49 - "Local Workspace Shell"
Cohesion: 0.25
Nodes (8): Codex Account Linking UI, Document Workspace UI, Decision Evidence Dialog, Local Workspace Shell, Project Materials UI, Project Processing Workflow UI, Project Codex Chat UI, Projects Panel

### Community 50 - "Verify Job"
Cohesion: 0.38
Nodes (7): CI Workflow, Playwright Failure Artifacts, Node.js 24 Environment, npm run check, Playwright Browser Smoke Tests, Verify Job, Backend Quick Diagnostics

### Community 51 - "Superficial Document Root Cause"
Cohesion: 0.29
Nodes (7): Material-Derivative Storage, DEFAULT_DOCUMENT and Example BOQ Seed, DEKEL Matching Against Example Codes, Query: Superficial Document After Media Upload, Separate Material Analysis Action, Superficial Document Root Cause, Material Analysis and Correction UI

### Community 52 - "server.ts"
Cohesion: 0.32
Nodes (5): integerFromEnvironment(), loadLocalAppConfig(), app, config, server

### Community 53 - "תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים"
Cohesion: 0.33
Nodes (6): משאבות, צנרת ולוחות פיקוד במקלטים, תיקון 1 לפרק 58/59 — מתקני תברואה במרחבים מוגנים, פרק 58/59 — מרחבים מוגנים ומקלטים, דרישות בנייה ומערכות למרחבים מוגנים, תיקון 2 לפרק 58/59 — החלפת תיקון 1, משאבות וניקוז למרחבים מוגנים לפי תיקון 2

### Community 54 - "CodexGateway"
Cohesion: 0.13
Nodes (6): LocalAppConfig, CodexGateway, LocalWorkspaceController, LocalWorkspaceLogger, formatMediaTime(), AudioTranscriptionGateway

### Community 55 - "ProfessionalKnowledgeService"
Cohesion: 0.40
Nodes (5): Project Applicability Boundary, Hybrid Lexical and Metadata Ranking, Lazy Local Retrieval, ProfessionalKnowledgeService, Semantic Index Revisit Condition

### Community 56 - "Q: Почему после загрузки фото и видео локальная система показала поверхностный шаблонный документ и не создала глубокую реальную смету?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Почему после загрузки фото и видео локальная система показала поверхностный шаблонный документ и не создала глубокую реальную смету?, Source Nodes

### Community 57 - "Shop Drawings and Prototypes"
Cohesion: 0.50
Nodes (4): Carpentry and Steelwork Specification, Shop Drawings and Prototypes, Aluminium Work Specification, Fabrication, Glazing and Finishes

### Community 58 - "דף תיקון לקיבוע רעפים"
Cohesion: 0.50
Nodes (4): דף תיקון לקיבוע רעפים, דרישות התקנה וקיבוע רעפים, מפרט נגרות חרש וסיכוך, גגות, פרגולות ורצפות עץ

### Community 59 - "מפרט עבודות גינון והשקיה"
Cohesion: 0.50
Nodes (4): מפרט עבודות גינון והשקיה, נטיעות ומערכות השקיה, מפרט אחזקת גנים, אחזקת צמחייה ומערכות השקיה

### Community 60 - "Clarification and Review Gate"
Cohesion: 0.67
Nodes (3): No-Guessing Principle, Clarification and Review Gate, Source Priority Policy

### Community 61 - "Reference-Only Professional Retrieval"
Cohesion: 0.67
Nodes (3): Rebuildable Knowledge Cache, Reference-Only Professional Retrieval, 3210 and Blue Book Context Retrieval

### Community 96 - "Explicit Confirmation Dialog"
Cohesion: 0.40
Nodes (5): Seven Images Sent to Chat, Missing Audio Transcription, Explicit Confirmation Dialog, Project-Scoped Codex Chat, Confirmed Atomic Chat Changes

### Community 97 - "detectWorkItems"
Cohesion: 0.39
Nodes (8): buildSewerDescriptorSuffix(), detectWorkItems(), extractExplicitAreaQuantity(), extractExplicitDepthMeters(), extractExplicitDiameterMm(), extractExplicitLinearQuantity(), extractExplicitUnitQuantity(), parsePositiveQuantity()

### Community 98 - "buildDekelCandidateMatchesForCase"
Cohesion: 0.33
Nodes (6): buildDekelCandidateMatchesForCase(), buildRouteReason(), testDekelMatchingChapterPrefilterBoostsPreferredChapter(), testDekelMatchingKeepsPipeCandidateInsideExpandedIntermediatePool(), testDekelMatchingPrefersPipeInstallationOverExcavationForSewerReplacement(), testDekelMatchingUsesWorkItemAwareQueries()

## Knowledge Gaps
- **299 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `calculateProjectSummary()` connect `calculateProjectSummary` to `local-workspace-service.ts`, `.chat`, `app.js`, `renderDocument`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Unresolved Versus Owner-Excluded DEKEL State` connect `escapeHtml` to `local-workspace-service.ts`, `DEKEL Global Pricebook`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `DEKEL Review UI` connect `DEKEL Global Pricebook` to `Explicit Confirmation Dialog`, `escapeHtml`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `createApp()` (e.g. with `.analyzeCase()` and `.createCase()`) actually correct?**
  _`createApp()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `local-workspace-service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06980433632998413 - nodes in this community are weakly interconnected._
- **Should `media-audio-transcription.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07764876632801161 - nodes in this community are weakly interconnected._