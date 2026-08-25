import { calculateProjectSummary, VAT_RATE } from "./calculations.js";
import { assessA4Document, paginateBoqRows } from "./document-layout.js";

const ACTIVE_PROJECT_KEY = "mashmauet.active-project.v1";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantityFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
});

const LEGACY_BOQ_DESCRIPTIONS = Object.freeze({
  "95.05.10.0045": { short: "איטום גג ביריעות P.V.C", full: "איטום גגות קלים ביריעות P.V.C (היריעה חסינת אש לפי ת\"י 755), מחוזקת בממברנה מפוליאסטר, בשיטת הקיבוע המכני (הנחה חצי חופשית) לרבות קיבוע מכני של פלטות פוליסטירן מוקצף 30-F בעובי 4 ס\"מ לתשתית הגג ע\"י ברגי דיסקית מצופים P.V.C, יריעות P.V.C לבנות בעובי 1.2 מ\"מ משורינות ברשת פוליאסטר מולחמות לדיסקיות הקיבוע והלחמת חפיפות ברוחב 10 ס\"מ, איטום פרטים שונים כגון: פתחי ניקוז, צנרת ואביזרים, סגירת יריעות האיטום בקצה הגג ע\"י פרופיל זווית מ-P.V.C במידות 4/4 ס\"מ או 6/6 ס\"מ. תקופת אחריות של 20 שנים" },
  "95.10.20.0034": { short: "ריצוף באריחי גרניט פורצלן", full: "ריצוף באריחי גומי בעובי 2.6 מ\"מ ובמידות 50/50 ס\"מ, 100/100 ס\"מ, על משטח מיושר וקשיח הנמדד בנפרד" },
  "95.22.20.0049": { short: "תקרת מגשי פח צבועים", full: "תקרת מגשי פח מגולוון מכופפים בכל צדדיו וצבוע בצבע אפור או לבן: מגשים עם חירור מיקרו שוליים רחבים, ברוחב 50, 40, 30 ס\"מ ובעובי 0.6 מ\"מ, כדוגמת \"Innovate\" או ש\"ע עם בידוד אקוסטי בגב המגש. המחיר כולל את הפרופילים הנושאים, אלמנטי התליה (בגובה עד 1.0 מ') ופרופילי הגמר (L+Z) בעובי 1.2 מ\"מ ליד הקירות. (מחיר יסוד למגשי פח 150 ש''ח/מ''ר)" },
  "95.08.42.0210": { short: "גוף תאורה לינארי מוגן", full: "גוף תאורה לינארי צמוד תקרה 6400LM IP65 באורך 1500mm" },
  "95.08.50.0140": { short: "נקודת מאור בכבל מתאים", full: "נקודת מאור במעגל חד פאזי לרבות צינורות בהתקנה גלויה או חשיפה, כבלי נחושת N2XY/FR בחתך 3X1.5 ממ\"ר מהלוח עד היציאה מהתקרה או הקיר ועד המפסקים, מפסק/י זרם יחיד או כפול או דו קוטבי או חילוף או צלב או לחצנים או מוגן מים או משוריין, ומוליך נוסף עבור נקודה לתאורת חירום, אם נדרש, לרבות וו תליה" },
  "95.07.10.0235": { short: "נקודת ניקוז למערכת מיזוג", full: "נקודה לניקוז מזגן מפוצל או מיני מרכזי או מערכת VRF, לרבות צינור פוליפרופילן בקוטר 32-40 מ\"מ ובאורך עד 4.0 מ' וחיבור למחסום רצפה קיים" },
  "95.69.04.0003": { short: "ניקיון יסודי לאחר שיפוץ", full: "נקיון יסודי חד פעמי של מבנים הכוללים שטחים ציבוריים לאחר שיפוץ ולפני איכלוס. שטחים ציבוריים כוללים: חצרות, חדרי מדרגות, חניונים, חדרי שרות, חלונות פנים וחוץ - קומפלט לרבות פנים המשרדים. (השטחים הציבוריים נכללים אך לא נמדדים)" },
});

const EXAMPLE_BOQ_IDS = Object.freeze({
  "95.05.10.0045": "boq-example-95-05-10-0045",
  "95.10.20.0034": "boq-example-95-10-20-0034",
  "95.22.20.0049": "boq-example-95-22-20-0049",
  "95.08.42.0210": "boq-example-95-08-42-0210",
  "95.08.50.0140": "boq-example-95-08-50-0140",
  "95.07.10.0235": "boq-example-95-07-10-0235",
  "95.69.04.0003": "boq-example-95-69-04-0003",
});

const elements = {
  projectList: document.querySelector("#project-list"),
  projectSearch: document.querySelector("#project-search"),
  materialList: document.querySelector("#material-list"),
  materialInput: document.querySelector("#material-input"),
  materialDialog: document.querySelector("#material-dialog"),
  materialDialogTitle: document.querySelector("#material-dialog-title"),
  materialDetails: document.querySelector("#material-details"),
  materialDialogMessage: document.querySelector("#material-dialog-message"),
  materialPreview: document.querySelector("#material-preview"),
  materialContentEditor: document.querySelector("#material-content-editor"),
  materialContentStatus: document.querySelector("#material-content-status"),
  dekelDialog: document.querySelector("#dekel-dialog"),
  dekelCatalogStatus: document.querySelector("#dekel-catalog-status"),
  dekelLines: document.querySelector("#dekel-lines"),
  dekelWarnings: document.querySelector("#dekel-warnings"),
  dekelFinancialAudit: document.querySelector("#dekel-financial-audit"),
  dekelReviewSummary: document.querySelector("#dekel-review-summary"),
  dekelApplyButton: document.querySelector("#dekel-apply-button"),
  evidenceDialog: document.querySelector("#evidence-dialog"),
  evidenceDialogMarker: document.querySelector("#evidence-dialog-marker"),
  evidenceDialogTitle: document.querySelector("#evidence-dialog-title"),
  evidenceDialogExplanation: document.querySelector("#evidence-dialog-explanation"),
  evidenceDialogDetails: document.querySelector("#evidence-dialog-details"),
  evidenceDialogExcerpt: document.querySelector("#evidence-dialog-excerpt"),
  evidenceDiscussButton: document.querySelector("#evidence-discuss-button"),
  evidenceSourceButton: document.querySelector("#evidence-source-button"),
  documentStage: document.querySelector("#document-stage"),
  a4LayoutWarning: document.querySelector("#a4-layout-warning"),
  projectProcessing: document.querySelector("#project-processing"),
  workflowProgress: document.querySelector("#workflow-progress"),
  workflowError: document.querySelector("#workflow-error"),
  retryWorkflowButton: document.querySelector("#retry-workflow-button"),
  documentReadiness: document.querySelector("#document-readiness"),
  workspaceTitle: document.querySelector("#workspace-title"),
  saveIndicator: document.querySelector("#save-indicator"),
  editButton: document.querySelector("#edit-button"),
  dekelReviewButton: document.querySelector("#dekel-review-button"),
  exportButton: document.querySelector("#export-button"),
  printButton: document.querySelector("#print-button"),
  projectDialog: document.querySelector("#project-dialog"),
  projectForm: document.querySelector("#project-form"),
  versionsDialog: document.querySelector("#versions-dialog"),
  versionsList: document.querySelector("#versions-list"),
  projectSettingsDialog: document.querySelector("#project-settings-dialog"),
  projectSettingsForm: document.querySelector("#project-settings-form"),
  systemDialog: document.querySelector("#system-dialog"),
  backupsList: document.querySelector("#backups-list"),
  archivedProjectsList: document.querySelector("#archived-projects-list"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmForm: document.querySelector("#confirm-form"),
  codexDialog: document.querySelector("#codex-dialog"),
  codexStatus: document.querySelector("#codex-status"),
  chatStateMessage: document.querySelector("#chat-state-message"),
  chatMessages: document.querySelector("#chat-messages"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  toast: document.querySelector("#toast"),
};

let projects = [];
let activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || "";
let editing = false;
let saveTimer;
let toastTimer;
let selectedMaterialId = "";
let selectedMaterialContent = null;
let selectedEvidenceNoteId = "";
let currentDekelCatalog = null;
let confirmResolver;
let codexConnected = false;
let chatSending = false;
let a4LayoutIssues = [];
let a4LayoutFrame;
const processingPolls = new Map();
let codexConnectionMessage = "בודק את החיבור לחשבון הנוכחי...";

function createDefaultProject() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "שיפוץ מבנה — פרויקט לדוגמה",
    description: "שיפוץ והתאמת מבנה קיים לצרכים תפעוליים, כולל עבודות איטום, גמר, חשמל ומיזוג.",
    createdAt: now,
    updatedAt: now,
    materials: [],
    versions: [],
    processing: {
      runId: null,
      status: "idle",
      stage: "awaiting_materials",
      readyForExport: false,
      progressPercent: 0,
      sourceFingerprint: null,
      validatedDocumentFingerprint: null,
      warningCodes: [],
      updatedAt: now,
    },
    chat: [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "אני צ'אט הפרויקט. כרגע חישובי המסמך פעילים מקומית; לאחר הקישור החד־פעמי Codex יוכל לקרוא את חומרי הפרויקט, לענות ולנסח הצעות שינוי לאישור.",
        createdAt: now,
      },
    ],
    document: createBlankDocumentTemplate(),
  };
}

function createBlankDocumentTemplate() {
  return {
    subject: "מסמך משמעויות לפרויקט חדש",
    background: "",
    objective: "",
    scope: [],
    estimateNotes: [],
    scheduleRows: [],
    scheduleNotes: "",
    riskRows: [],
    additionalNotes: "",
    boqRows: [],
    evidenceNotes: [],
  };
}

function createDocumentTemplate() {
  return {
    subject: "מסמך משמעויות לפרויקט שיפוץ והתאמת מבנה",
    background:
      "בהמשך לסיור ולבחינת הצורך המבצעי, נדרש לבצע עבודות שיפוץ והתאמה במבנה הקיים, בהתאם לתכולה המפורטת במסמך זה ובכתב הכמויות המצורף.",
    objective:
      "הצגת משמעויות ראשוניות לפרויקט, לרבות תכולת העבודה, אומדן תקציבי, לוח זמנים עקרוני וניהול סיכונים, לצורך קבלת החלטה והמשך תכנון וביצוע.",
    scope: [
      "עבודות הכנה, פירוק ופינוי בהתאם לצורך.",
      "עבודות איטום, תיקונים וגמר במעטפת ובחללים הפנימיים.",
      "התאמות חשמל, תאורה ומיזוג אוויר.",
      "בדיקות, ניקיון ומסירת המבנה לאחר השלמת העבודות.",
    ],
    estimateNotes: [
      "האומדן מבוסס על כתב הכמויות המפורט ועל מחירי היחידה שנבחרו.",
      "המחירים בפירוט האומדן כוללים מע״מ בשיעור 18%.",
      "דמי תכנון, תפעול וניהול ופיקוח מחושבים מהסכום הכולל מע״מ.",
    ],
    scheduleRows: [
      { stage: "תכנון, תיאום ואישור", duration: "3–4 שבועות", notes: "לאחר אישור הפרויקט" },
      { stage: "היערכות והזמנת חומרים", duration: "2–3 שבועות", notes: "במקביל להשלמת התכנון" },
      { stage: "ביצוע העבודות", duration: "8–10 שבועות", notes: "בהתאם לזמינות האתר" },
      { stage: "בדיקות ומסירה", duration: "שבוע", notes: "לאחר השלמת כלל העבודות" },
    ],
    scheduleNotes:
      "לוח הזמנים הינו עקרוני ויעודכן לאחר השלמת התכנון, אישור כתב הכמויות ותיאום מועד תחילת הביצוע.",
    riskRows: [
      { risk: "אי־התאמות בין התכנון למצב הקיים", response: "מדידה וסיור משותף לפני ביצוע", owner: "תכנון וביצוע" },
      { risk: "עיכוב באספקת חומרים", response: "הזמנה מוקדמת ואישור חלופות", owner: "ניהול הפרויקט" },
      { risk: "עבודות נוספות שיתגלו במהלך הביצוע", response: "עצירה, תיעוד ואישור לפני ביצוע", owner: "פיקוח" },
    ],
    additionalNotes:
      "אין לבצע שינוי בתכולה או חריגה מכתב הכמויות ללא תיעוד ואישור הגורם המוסמך.",
    boqRows: [
      { id: EXAMPLE_BOQ_IDS["95.05.10.0045"], code: "95.05.10.0045", description: LEGACY_BOQ_DESCRIPTIONS["95.05.10.0045"].full, unit: "מטר", quantity: 147.1, unitPrice: 211, category: "עבודות איטום" },
      { id: EXAMPLE_BOQ_IDS["95.10.20.0034"], code: "95.10.20.0034", description: LEGACY_BOQ_DESCRIPTIONS["95.10.20.0034"].full, unit: "מ״ר", quantity: 25, unitPrice: 496, category: "עבודות גמר" },
      { id: EXAMPLE_BOQ_IDS["95.22.20.0049"], code: "95.22.20.0049", description: LEGACY_BOQ_DESCRIPTIONS["95.22.20.0049"].full, unit: "מטר", quantity: 143, unitPrice: 348, category: "עבודות גמר" },
      { id: EXAMPLE_BOQ_IDS["95.08.42.0210"], code: "95.08.42.0210", description: LEGACY_BOQ_DESCRIPTIONS["95.08.42.0210"].full, unit: "יח׳", quantity: 12, unitPrice: 347, category: "עבודות חשמל ותאורה" },
      { id: EXAMPLE_BOQ_IDS["95.08.50.0140"], code: "95.08.50.0140", description: LEGACY_BOQ_DESCRIPTIONS["95.08.50.0140"].full, unit: "יח׳", quantity: 12, unitPrice: 221, category: "עבודות חשמל ותאורה" },
      { id: EXAMPLE_BOQ_IDS["95.07.10.0235"], code: "95.07.10.0235", description: LEGACY_BOQ_DESCRIPTIONS["95.07.10.0235"].full, unit: "קומפ׳", quantity: 3, unitPrice: 920, category: "מיזוג ותשתיות" },
      { id: EXAMPLE_BOQ_IDS["95.69.04.0003"], code: "95.69.04.0003", description: LEGACY_BOQ_DESCRIPTIONS["95.69.04.0003"].full, unit: "מטר", quantity: 143, unitPrice: 23.5, category: "עבודות משלימות" },
    ],
    evidenceNotes: [createDefaultEvidenceNote(EXAMPLE_BOQ_IDS["95.69.04.0003"])],
  };
}

function createDefaultEvidenceNote(anchorId) {
  return {
    id: "evidence-example-final-cleaning",
    anchorType: "boqRow",
    anchorId,
    kind: "inference",
    title: "עבודה משלימה שנכללה על ידי המערכת",
    explanation: "המערכת כללה ניקיון יסודי לאחר השלמת עבודות השיפוץ.",
    reason: "ניקיון ומסירה הם שלב נדרש להשלמת עבודות שיפוץ ולהכנת המבנה לאכלוס, גם כאשר העבודה אינה מפורטת בתיאור הראשוני.",
    confidence: "high",
  };
}

function getActiveProject() {
  return projects.find((project) => project.id === activeProjectId) || projects[0];
}

async function persistProjects() {
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
  const project = getActiveProject();
  if (!project) return;
  await persistProject(project);
}

async function persistProject(project) {
  const { project: saved } = await requestJson(`/local/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: project.name, description: project.description, document: project.document }),
  });
  const index = projects.findIndex((item) => item.id === saved.id);
  if (index >= 0) {
    projects[index].updatedAt = saved.updatedAt;
    projects[index].revision = saved.revision;
  }
}

function markChanged() {
  const project = getActiveProject();
  project.updatedAt = new Date().toISOString();
  elements.saveIndicator.textContent = "שומר...";
  elements.saveIndicator.classList.add("saving");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      await persistProject(project);
      elements.saveIndicator.textContent = "כל השינויים נשמרו";
      elements.saveIndicator.className = "save-indicator";
    } catch (error) {
      elements.saveIndicator.textContent = "השמירה נכשלה — נסה שוב";
      elements.saveIndicator.className = "save-indicator error";
      showToast(error.message, "error", 5000);
    }
  }, 420);
}

function renderAll() {
  const project = getActiveProject();
  elements.workspaceTitle.textContent = project.name;
  renderProjectProcessing(project);
  renderProjects();
  renderMaterials();
  renderDocument();
  renderChat();
}

const WORKFLOW_STAGES = Object.freeze({
  awaiting_materials: { label: "ממתין לחומרי הפרויקט", progress: 0, group: "materials" },
  extracting: { label: "שומר וקורא את חומרי הפרויקט", progress: 8, group: "materials" },
  awaiting_video_frames: { label: "מכין פריימים מהווידאו", progress: 10, group: "materials" },
  transcribing_audio: { label: "מתמלל את ההסברים מהווידאו", progress: 15, group: "analysis" },
  analyzing_materials: { label: "מנתח מסמכים, תמונות ווידאו", progress: 30, group: "analysis" },
  consolidating_evidence: { label: "מאחד עובדות, מדידות ודרישות", progress: 48, group: "analysis" },
  understanding_work: { label: "בונה תכולת עבודות מלאה", progress: 58, group: "scope" },
  quantifying: { label: "מחשב כמויות והנחות מקצועיות", progress: 66, group: "scope" },
  matching_dekel: { label: "מתאים עבודות למחירון DEKEL", progress: 78, group: "dekel" },
  building_document: { label: "מכין את המסמך", progress: 88, group: "document" },
  validating: { label: "בודק כספים ומבנה A4", progress: 95, group: "document" },
  complete: { label: "עיבוד הפרויקט הושלם", progress: 100, group: "document" },
});

function projectProcessingState(project) {
  const processing = project?.processing;
  const stage = WORKFLOW_STAGES[processing?.stage] ? processing.stage : project?.materials?.length ? "extracting" : "awaiting_materials";
  const status = ["idle", "queued", "running", "needs_review", "ready", "failed", "stale"].includes(processing?.status) ? processing.status : "idle";
  const definition = WORKFLOW_STAGES[stage];
  const progress = Number.isFinite(Number(processing?.progressPercent))
    ? Math.max(0, Math.min(100, Number(processing.progressPercent)))
    : definition.progress;
  return { ...processing, status, stage, progressPercent: progress, readyForExport: processing?.readyForExport === true };
}

function renderProjectProcessing(project) {
  const processing = projectProcessingState(project);
  const definition = WORKFLOW_STAGES[processing.stage];
  const ready = processing.readyForExport === true;
  elements.projectProcessing.dataset.workflowState = processing.status;
  elements.projectProcessing.dataset.workflowStage = processing.stage;
  elements.projectProcessing.querySelector("#processing-title").textContent = processing.status === "failed" ? "עיבוד הפרויקט נעצר" : processing.status === "stale" ? "חומרי הפרויקט השתנו בזמן העיבוד" : processing.status === "needs_review" ? "המסמך נבנה אך נדרשת השלמת בדיקה" : definition.label;
  elements.documentReadiness.textContent = ready ? "המסמך מוכן לבדיקה, להדפסה ולייצוא" : "המסמך עדיין אינו מוכן להדפסה או לייצוא";
  elements.documentReadiness.classList.toggle("ready", ready);
  elements.workflowProgress.setAttribute("aria-valuenow", String(processing.progressPercent));
  elements.workflowProgress.querySelector("span").style.width = `${processing.progressPercent}%`;
  elements.projectProcessing.querySelectorAll("[data-workflow-stage]").forEach((item) => {
    const stageOrder = ["materials", "analysis", "scope", "dekel", "document"];
    const currentIndex = stageOrder.indexOf(definition.group);
    const itemIndex = stageOrder.indexOf(item.dataset.workflowStage);
    item.classList.toggle("active", processing.status !== "failed" && itemIndex === currentIndex);
    item.classList.toggle("completed", ready || (currentIndex >= 0 && itemIndex < currentIndex));
  });
  elements.workflowError.textContent = processing.error?.message || (processing.warningCodes?.length ? `נדרשת השלמה: ${processing.warningCodes.join(", ")}` : "עיבוד הפרויקט נעצר. הנתונים נשמרו ואפשר להפעיל אותו מחדש.");
  elements.workflowError.hidden = !["failed", "stale", "needs_review"].includes(processing.status);
  elements.retryWorkflowButton.hidden = !["failed", "stale", "needs_review"].includes(processing.status);
  syncProjectReadiness(project);
}

function syncProjectReadiness(project = getActiveProject()) {
  const processing = projectProcessingState(project);
  const ready = processing.readyForExport === true;
  const dekelAvailable = Boolean(project?.document?.boqRows?.length) && ["needs_review", "ready"].includes(processing.status);
  elements.dekelReviewButton.disabled = !dekelAvailable;
  elements.exportButton.disabled = !ready;
  elements.printButton.disabled = !ready;
  elements.dekelReviewButton.title = dekelAvailable ? "" : "בדיקת DEKEL תהיה זמינה לאחר בניית כתב הכמויות";
  for (const button of [elements.exportButton, elements.printButton]) button.title = ready ? "" : "הפעולה תהיה זמינה רק לאחר השלמת עיבוד הפרויקט ובדיקת המסמך";
  return ready;
}

function ensureProjectReadyForExport() {
  if (syncProjectReadiness()) return true;
  elements.projectProcessing.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("הפעולה נעצרה: המסמך עדיין לא עבר את כל שלבי העיבוד והבדיקה", "error", 6000);
  return false;
}

function renderProjects() {
  const query = elements.projectSearch.value.trim().toLowerCase();
  const visibleProjects = projects.filter((project) =>
    `${project.name} ${project.description}`.toLowerCase().includes(query),
  );
  elements.projectList.innerHTML = visibleProjects.length
    ? visibleProjects.map(
      (project) => `
        <button class="project-card ${project.id === activeProjectId ? "active" : ""}" data-project-id="${project.id}" type="button">
          <span class="project-initial">${escapeHtml(project.name.slice(0, 1))}</span>
          <span><strong dir="auto">${escapeHtml(project.name)}</strong><span>${escapeHtml(shortDate(project.updatedAt))}</span></span>
        </button>`,
      ).join("")
    : '<div class="empty-state compact"><strong>לא נמצאו פרויקטים</strong><span>נסה חיפוש אחר או פתח פרויקט חדש.</span></div>';
}

function renderMaterials() {
  const materials = getActiveProject().materials;
  elements.materialList.innerHTML = materials.length
    ? materials
        .map(
          (material) => `
            <div class="material-item ${escapeAttribute(material.status)}">
              <button class="material-open" data-material-id="${material.id}" type="button" title="${escapeHtml(`${material.name} — ${materialSummary(material)}`)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v6h5"/></svg>
                <span><strong dir="auto">${escapeHtml(material.name)}</strong><small>${escapeHtml(materialSummary(material))}</small></span>
              </button>
              <button class="material-delete" data-delete-material="${material.id}" type="button" aria-label="מחיקת ${escapeHtml(material.name)}">×</button>
            </div>`,
        )
        .join("")
    : '<div class="empty-state compact"><strong>אין עדיין חומרים</strong><span>הוסף PDF, Excel, מסמך, תמונה או וידאו לפרויקט הזה.</span></div>';
}

function renderDocument() {
  const project = getActiveProject();
  const doc = project.document;
  ensureDocumentEvidence(doc);
  const summary = calculateProjectSummary(doc.boqRows);
  const editable = editing ? 'contenteditable="true"' : "";
  const evidenceIndex = buildEvidenceIndex(doc);
  const visibleBoqRows = editing ? summary.boq.rows : summary.pricing.pricedRows;
  const boqPages = paginateBoqRows(visibleBoqRows.map((row) => ({
    ...row,
    evidenceCount: (evidenceIndex.get(row.id) || []).length,
  })));

  elements.documentStage.innerHTML = `
    <article id="printable-document" aria-label="מסמך משמעויות">
      <section class="document-page narrative-page narrative-page-one">
        <div class="page-content">
        ${renderEvidenceOverview(doc)}
        <h1 class="document-subject" ${editable} data-doc-field="subject">הנדון: ${escapeHtml(doc.subject)}</h1>
        ${narrativeSection(1, "רקע", doc.background, "background", editable)}
        ${narrativeSection(2, "מטרת המסמך", doc.objective, "objective", editable)}
        <section class="document-section">
          <h2>3. תכולת הפרויקט:</h2>
          <ol type="א">${doc.scope.map((item, index) => `<li ${editable} data-doc-array="scope" data-index="${index}">${escapeHtml(item)}</li>`).join("")}</ol>
        </section>
        </div>
        <footer class="page-footer">עמוד 1 מתוך 3</footer>
      </section>

      <section class="document-page narrative-page narrative-page-two">
        <div class="page-content">
        <div class="estimate-page-grid">
          <section class="document-section estimate-section">
            <h2>4. פירוט האומדן:</h2>
            <table class="official-table estimate-table">
              <thead><tr><th style="width:9%">מס׳</th><th>סוג העבודה</th><th class="money" style="width:29%">סכום כולל מע״מ</th></tr></thead>
              <tbody>${summary.groups.map((group) => `<tr><td class="center">${group.serialNumber}</td><td>${escapeHtml(group.category)}</td><td class="money">${formatMoney(group.totalWithVat)}</td></tr>`).join("")}</tbody>
              <tfoot>
                <tr><td colspan="2">סה״כ ביצוע כולל מע״מ</td><td class="money">${formatMoney(summary.boq.totalWithVat)}</td></tr>
                ${summary.fees.map((fee) => `<tr><td colspan="2">${fee.label} (${formatPercent(fee.rate)})</td><td class="money">${formatMoney(fee.amount)}</td></tr>`).join("")}
                <tr class="grand-total"><td colspan="2">סה״כ אומדן הפרויקט</td><td class="money">${formatMoney(summary.grandTotal)}</td></tr>
              </tfoot>
            </table>
            ${renderUnpricedWorksNotice(summary.pricing)}
            <details class="estimate-source-details">
              <summary>הצגת התאמת ${summary.groups.length} סוגי העבודה לכתב הכמויות</summary>
              ${summary.groups.map((group) => `<section><h3>${escapeHtml(group.category)}</h3><ul>${group.sourceRows.map((row) => `<li>${escapeHtml(row.code)} · ${escapeHtml(row.description)} · ${formatMoney(row.amount)} לפני מע״מ</li>`).join("")}</ul></section>`).join("")}
            </details>
          </section>
          <div class="estimate-support-column">
            <section class="document-section estimate-notes-section"><h2>5. הערות לאומדן:</h2><ul>${doc.estimateNotes.map((item, index) => `<li ${editable} data-doc-array="estimateNotes" data-index="${index}">${escapeHtml(item)}</li>`).join("")}</ul></section>
          </div>
        </div>
        <section class="document-section">
          <h2>6. לו״ז עקרוני לפרויקט:</h2>
          ${renderScheduleTimeline(doc.scheduleRows, editable)}
        </section>
        ${narrativeSection(7, "הערות ללו״ז", doc.scheduleNotes, "scheduleNotes", editable)}
        </div>
        <footer class="page-footer">עמוד 2 מתוך 3</footer>
      </section>

      <section class="document-page narrative-page narrative-page-three">
        <div class="page-content">
        <section class="document-section">
          <h2>8. ניהול סיכונים:</h2>
          <table class="official-table"><thead><tr><th>סיכון</th><th>מענה</th><th>אחריות</th></tr></thead><tbody>${doc.riskRows.map((row, index) => `<tr><td ${editable} data-table="riskRows" data-index="${index}" data-key="risk">${escapeHtml(row.risk)}</td><td ${editable} data-table="riskRows" data-index="${index}" data-key="response">${escapeHtml(row.response)}</td><td ${editable} data-table="riskRows" data-index="${index}" data-key="owner">${escapeHtml(row.owner)}</td></tr>`).join("")}</tbody></table>
        </section>
        <section class="logic-box">
          <h3>הסבר חישוב</h3>
          <ol>
            <li>שורות כתב הכמויות מחושבות ללא מע״מ: כמות × מחיר נטו.</li>
            <li>מע״מ 18% מתווסף רק לסיכום כתב הכמויות.</li>
            <li>פירוט האומדן מאחד את השורות ל־3–5 סוגי עבודה וכל סכום בו כולל מע״מ.</li>
            <li>דמי תכנון 7.4%, תפעול וניהול 5.4% ופיקוח 2.7% מחושבים מסה״כ הביצוע שכבר כולל מע״מ.</li>
          </ol>
        </section>
        ${narrativeSection(9, "הערות נוספות", doc.additionalNotes, "additionalNotes", editable)}
        </div>
        <footer class="page-footer">עמוד 3 מתוך 3</footer>
      </section>
      ${renderBoqPages(boqPages, summary, evidenceIndex)}
    </article>`;
  requestAnimationFrame(() => {
    fitDocumentPreview();
    refreshA4LayoutStatus();
  });
}

function renderUnpricedWorksNotice(pricing) {
  if (!pricing.unpricedRowCount) return "";
  const label = pricing.pricedRowCount
    ? `האומדן הכספי כולל ${pricing.pricedRowCount} סעיפי DEKEL מתומחרים. ${pricing.unpricedRowCount} עבודות נוספות ממתינות להתאמה ולא נכללו בסכום.`
    : `טרם נבחרו סעיפי DEKEL מאומתים. ${pricing.unpricedRowCount} עבודות ממתינות להתאמה ולכן אין להציג סכום פרויקט.`;
  return `<aside class="unpriced-boq-notice" data-unpriced-boq role="status"><strong>מצב התמחור</strong><span>${escapeHtml(label)}</span></aside>`;
}

function renderScheduleTimeline(rows, editable) {
  if (!rows.length) return '<div class="schedule-timeline empty" role="img" aria-label="לוח זמנים טרם הוגדר"><span>לוח הזמנים ייבנה לאחר ניתוח חומרי הפרויקט.</span></div>';
  const phases = [];
  let cursor = 0;
  for (const [index, row] of rows.entries()) {
    const duration = scheduleDurationInWeeks(row.duration);
    const previous = phases.at(-1);
    const parallel = /במקביל|חופף|parallel/iu.test(String(row.notes || ""));
    const start = parallel && previous ? previous.start + Math.max(0.25, previous.duration * 0.35) : cursor;
    phases.push({ row, index, start, duration });
    cursor = Math.max(cursor, start + duration);
  }
  const totalWeeks = Math.max(1, Math.ceil(Math.max(...phases.map((phase) => phase.start + phase.duration))));
  const milestones = [0, 0.25, 0.5, 0.75, 1].map((ratio) => `<span style="right:${ratio * 100}%">שבוע ${Math.min(totalWeeks, Math.max(1, Math.round(totalWeeks * ratio) || 1))}</span>`).join("");
  return `<div class="schedule-timeline" role="img" aria-label="לוח זמנים גרפי משוער של ${totalWeeks} שבועות">
    <div class="schedule-scale" aria-hidden="true">${milestones}</div>
    ${phases.map(({ row, index, start, duration }) => {
      const right = Math.min(98, start / totalWeeks * 100);
      const width = Math.max(5, Math.min(100 - right, duration / totalWeeks * 100));
      return `<div class="schedule-phase">
        <div class="schedule-phase-label"><strong ${editable} data-table="scheduleRows" data-index="${index}" data-key="stage">${escapeHtml(row.stage)}</strong><small ${editable} data-table="scheduleRows" data-index="${index}" data-key="notes">${escapeHtml(row.notes)}</small></div>
        <div class="schedule-track"><span class="schedule-bar" style="--schedule-right:${right}%;--schedule-width:${width}%"><b ${editable} data-table="scheduleRows" data-index="${index}" data-key="duration">${escapeHtml(row.duration)}</b></span></div>
      </div>`;
    }).join("")}
  </div>`;
}

function scheduleDurationInWeeks(value) {
  const text = String(value || "").replace(/,/gu, ".");
  const numbers = [...text.matchAll(/\d+(?:\.\d+)?/gu)].map((match) => Number(match[0])).filter(Number.isFinite);
  const amount = numbers.length ? Math.max(...numbers) : 1;
  if (/יום|ימים|ימי(?:\s+עבודה)?|day/iu.test(text)) return Math.max(0.2, amount / 5);
  if (/חודש|months?/iu.test(text)) return amount * 4.3;
  return amount;
}

function fitDocumentPreview() {
  const pages = elements.documentStage.querySelectorAll(".narrative-page");
  if (!pages.length) return;
  if (window.matchMedia("(max-width: 900px)").matches) {
    pages.forEach((page) => { page.style.zoom = ""; });
    return;
  }
  const a4LandscapeWidthPx = 297 / 25.4 * 96;
  const availableWidth = Math.max(320, elements.documentStage.clientWidth - 8);
  const scale = Math.min(1, availableWidth / a4LandscapeWidthPx);
  pages.forEach((page) => { page.style.zoom = String(scale); });
  if (document.body.classList.contains("document-focus")) elements.documentStage.scrollLeft = 0;
}

function measureA4Page(page, label) {
  const content = page.querySelector(".page-content");
  const style = window.getComputedStyle(page);
  const verticalPadding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  return {
    label,
    contentHeight: content?.scrollHeight || 0,
    availableHeight: Math.max(0, page.clientHeight - verticalPadding),
    element: page,
  };
}

function readA4Layout() {
  const documentRoot = elements.documentStage.querySelector("#printable-document");
  if (!documentRoot) return { narrativePages: [], boqPages: [], totalsBlockCount: 0 };
  return {
    narrativePages: [...documentRoot.querySelectorAll(".narrative-page")].map((page, index) => measureA4Page(page, `עמוד מסמך ${index + 1}`)),
    boqPages: [...documentRoot.querySelectorAll(".boq-page")].map((page, index) => measureA4Page(page, `עמוד כתב כמויות ${index + 1}`)),
    totalsBlockCount: documentRoot.querySelectorAll("[data-boq-totals]").length,
  };
}

function refreshA4LayoutStatus() {
  const pages = [...elements.documentStage.querySelectorAll(".document-page")];
  pages.forEach((page) => page.classList.remove("layout-compact", "layout-tight", "layout-overflow"));

  let layout = readA4Layout();
  assessA4Document(layout)
    .filter((issue) => issue.code === "page-overflow")
    .forEach((issue) => layout.narrativePages.find((page) => page.label === issue.label)?.element.classList.add("layout-compact"));

  layout = readA4Layout();
  assessA4Document(layout)
    .filter((issue) => issue.code === "page-overflow")
    .forEach((issue) => layout.narrativePages.find((page) => page.label === issue.label)?.element.classList.add("layout-tight"));

  layout = readA4Layout();
  a4LayoutIssues = assessA4Document(layout);
  const pageByLabel = new Map([...layout.narrativePages, ...layout.boqPages].map((page) => [page.label, page.element]));
  a4LayoutIssues.filter((issue) => issue.code === "page-overflow").forEach((issue) => pageByLabel.get(issue.label)?.classList.add("layout-overflow"));

  if (!a4LayoutIssues.length) {
    elements.a4LayoutWarning.hidden = true;
    elements.a4LayoutWarning.textContent = "";
    return [];
  }

  const overflowingLabels = a4LayoutIssues.filter((issue) => issue.code === "page-overflow").map((issue) => issue.label);
  const details = overflowingLabels.length ? ` חריגה זוהתה ב: ${overflowingLabels.join(", ")}.` : " מבנה העמודים אינו תקין.";
  elements.a4LayoutWarning.textContent = `המסמך אינו מוכן להדפסה או לייצוא.${details} התוכן נשאר גלוי לבדיקה; יש לקצר, לפצל או לערוך אותו.`;
  elements.a4LayoutWarning.hidden = false;
  return a4LayoutIssues;
}

function scheduleA4LayoutCheck() {
  window.cancelAnimationFrame(a4LayoutFrame);
  a4LayoutFrame = window.requestAnimationFrame(refreshA4LayoutStatus);
}

function ensureA4LayoutReady() {
  const issues = refreshA4LayoutStatus();
  if (!issues.length) return true;
  elements.a4LayoutWarning.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("ההדפסה והייצוא נעצרו: יש תוכן שחורג מגבולות A4", "error", 7000);
  return false;
}

function narrativeSection(number, title, value, field, editable) {
  return `<section class="document-section"><h2>${number}. ${title}:</h2><p ${editable} data-doc-field="${field}">${escapeHtml(value)}</p></section>`;
}

function renderEvidenceOverview(doc) {
  const notes = (doc.evidenceNotes || []).filter((note) => note?.id);
  if (!notes.length) return "";
  const label = notes.length === 1 ? "הנחה מקצועית אחת סומנה במסמך" : `${notes.length} הנחות מקצועיות סומנו במסמך`;
  return `<button class="evidence-overview" type="button" data-evidence-jump="${escapeAttribute(notes[0].id)}" aria-label="${escapeAttribute(label)} — הצגת ההערה הראשונה">
    <span class="evidence-overview-number">${notes.length}</span><span>${escapeHtml(label)}</span><span aria-hidden="true">←</span>
  </button>`;
}

function renderBoqPages(pages, summary, evidenceIndex) {
  return pages.map((rows, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;
    return `<section class="document-page boq-page">
      <div class="page-content">
      <section class="document-section boq-section" aria-label="כתב כמויות${pageIndex ? " — המשך" : ""}">
        <table class="official-table boq-table">
          <colgroup><col class="boq-col-code"><col class="boq-col-description"><col class="boq-col-unit"><col class="boq-col-quantity"><col class="boq-col-price"><col class="boq-col-total">${editing ? '<col class="boq-col-actions">' : ""}</colgroup>
          <thead><tr><th>פריט SSC</th><th>תיאור מלא</th><th>יח׳ מידה</th><th>כמות</th><th class="money">מחיר נטו</th><th class="money">סה״כ</th>${editing ? '<th><span class="sr-only">פעולות</span></th>' : ""}</tr></thead>
          <tbody>${rows.map((row) => boqRow(row, row.sourceIndex, evidenceIndex)).join("")}</tbody>
          ${isLastPage ? `<tfoot data-boq-totals>
            <tr><td colspan="5">סה״כ לפני מע״מ</td><td class="money">${formatMoney(summary.boq.subtotalNet)}</td>${editing ? "<td></td>" : ""}</tr>
            <tr><td colspan="5">מע״מ 18%</td><td class="money">${formatMoney(summary.boq.vat)}</td>${editing ? "<td></td>" : ""}</tr>
            <tr class="grand-total"><td colspan="5">סה״כ כולל מע״מ</td><td class="money">${formatMoney(summary.boq.totalWithVat)}</td>${editing ? "<td></td>" : ""}</tr>
          </tfoot>` : ""}
        </table>
        ${editing && isLastPage ? '<div class="document-controls"><button id="add-boq-row" class="secondary-button" type="button">הוספת שורה</button></div>' : ""}
      </section>
      </div>
      <footer class="page-footer">כתב כמויות · עמוד ${pageIndex + 1} מתוך ${pages.length}</footer>
    </section>`;
  }).join("");
}

function boqRow(row, index, evidenceIndex) {
  if (!editing) return `<tr>
    <td class="boq-code" dir="ltr">${escapeHtml(row.code)}</td>
    <td class="boq-description"><span class="boq-description-text">${escapeHtml(row.description)}</span><span class="boq-evidence-list">${renderEvidenceMarkers(row.id, evidenceIndex)}</span></td>
    <td class="center">${escapeHtml(formatBoqUnit(row.unit))}</td>
    <td class="boq-number">${formatQuantity(row.quantity)}</td>
    <td class="money">${formatMoney(row.unitPrice)}</td>
    <td class="money boq-amount">${formatMoney(row.amount)}</td>
  </tr>`;

  return `<tr class="boq-edit-row">
    <td><input dir="ltr" data-boq-index="${index}" data-boq-key="code" value="${escapeAttribute(row.code)}" aria-label="פריט SSC" /></td>
    <td><textarea class="description-input" rows="1" data-boq-index="${index}" data-boq-key="description" aria-label="תיאור מלא">${escapeHtml(row.description)}</textarea></td>
    <td><input data-boq-index="${index}" data-boq-key="unit" value="${escapeAttribute(formatBoqUnit(row.unit))}" aria-label="יחידת מידה" /></td>
    <td><input type="number" min="0" step="0.01" data-boq-index="${index}" data-boq-key="quantity" value="${row.quantity}" aria-label="כמות" /></td>
    <td><input type="number" min="0" step="0.01" data-boq-index="${index}" data-boq-key="unitPrice" value="${row.unitPrice}" aria-label="מחיר נטו" /></td>
    <td class="money">${formatMoney(row.amount)}</td>
    <td><button class="delete-row-button" data-delete-boq="${index}" type="button" aria-label="מחיקת שורה">×</button></td>
  </tr><tr class="boq-category-edit-row"><td colspan="7"><label class="sr-only" for="category-${index}">סוג עבודה מאוחד</label><input id="category-${index}" data-boq-index="${index}" data-boq-key="category" value="${escapeAttribute(row.category)}" aria-label="סוג עבודה עבור פירוט האומדן" /></td></tr>`;
}

function buildEvidenceIndex(doc) {
  const rowIds = new Set((doc.boqRows || []).map((row) => row.id));
  const byAnchor = new Map();
  (doc.evidenceNotes || []).forEach((note, noteIndex) => {
    if (!note?.id || note.anchorType !== "boqRow" || !rowIds.has(note.anchorId)) return;
    const item = { ...note, number: noteIndex + 1 };
    const notes = byAnchor.get(note.anchorId) || [];
    notes.push(item);
    byAnchor.set(note.anchorId, notes);
  });
  return byAnchor;
}

function renderEvidenceMarkers(anchorId, evidenceIndex) {
  const notes = evidenceIndex.get(anchorId) || [];
  return notes.map((note) => {
    const tooltipId = `evidence-tooltip-${note.number}`;
    const sourceLine = evidenceSourceLabel(note) || "הנחה על בסיס ההקשר; אין אסמכתה ישירה בחומר.";
    return `<span class="evidence-marker-wrap">
      <button class="evidence-marker evidence-${escapeAttribute(note.kind)}" type="button" data-evidence-note="${escapeAttribute(note.id)}" aria-label="הערה ${note.number}: ${escapeAttribute(note.title)}" aria-describedby="${tooltipId}">${note.number}</button>
      <span id="${tooltipId}" class="evidence-tooltip" role="tooltip"><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.reason)}</span><small>${escapeHtml(sourceLine)}</small></span>
    </span>`;
  }).join("");
}

function evidenceSourceLabel(note) {
  const source = note?.source;
  if (!source) return "";
  return [source.fileName, source.location].filter(Boolean).join(" · ");
}

function evidenceContext(noteId) {
  const doc = getActiveProject().document;
  const noteIndex = (doc.evidenceNotes || []).findIndex((item) => item.id === noteId);
  if (noteIndex < 0) return null;
  const note = doc.evidenceNotes[noteIndex];
  const row = (doc.boqRows || []).find((item) => item.id === note.anchorId);
  if (!row) return null;
  return { note, row, number: noteIndex + 1 };
}

function openEvidenceDialog(noteId) {
  const context = evidenceContext(noteId);
  if (!context) return;
  selectedEvidenceNoteId = noteId;
  const { note, row, number } = context;
  elements.evidenceDialogMarker.textContent = String(number);
  elements.evidenceDialogTitle.textContent = note.title;
  elements.evidenceDialogExplanation.textContent = note.explanation;
  elements.evidenceDialogDetails.innerHTML = [
    ["העבודה", `${row.code || "ללא קוד"} · ${row.description}`],
    ["למה היא נכללה", note.reason],
    ["רמת ביטחון", evidenceConfidenceLabel(note.confidence)],
    ["מקור", evidenceSourceLabel(note) || "הנחה מקצועית על בסיס ההקשר; אין אסמכתה ישירה בחומר."],
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const excerpt = note.source?.excerpt?.trim();
  elements.evidenceDialogExcerpt.textContent = excerpt || "";
  elements.evidenceDialogExcerpt.hidden = !excerpt;
  elements.evidenceSourceButton.hidden = !note.source;
  elements.evidenceDialog.showModal();
}

function evidenceConfidenceLabel(value) {
  return ({ high: "גבוהה", medium: "בינונית", low: "נמוכה" })[value] || "לא צוינה";
}

function findEvidenceMaterial(note) {
  const source = note?.source;
  if (!source) return null;
  const materials = getActiveProject().materials || [];
  return materials.find((item) => item.id === source.materialId)
    || materials.find((item) => source.fileName && item.name === source.fileName)
    || materials.find((item) => source.fileName && item.name.toLowerCase().includes(source.fileName.toLowerCase()));
}

function buildEvidenceChatContext(noteId) {
  const context = evidenceContext(noteId);
  if (!context) return "";
  const { note, row, number } = context;
  const source = evidenceSourceLabel(note) || "прямого подтверждения в материалах нет; это профессиональное допущение по контексту";
  return `[CONTEXT evidence-note:${note.id}]\nОбсуди примечание [${number}] к строке כתב כמויות ${row.code || "без кода"}.\nЧто добавлено: ${note.explanation}\nПочему: ${note.reason}\nУверенность: ${note.confidence}.\nИсточник: ${source}.\nПроверь это допущение по материалам текущего проекта и помоги мне уточнить или изменить его.`;
}

function renderChat() {
  const project = getActiveProject();
  const chat = project.chat;
  elements.chatMessages.innerHTML = chat
    .map(
      (message) => `${renderChatMessage(message)}${renderMessageProposals(project, message)}`,
    )
    .join("");
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderChatMessage(message) {
  const retry = message.role === "assistant" && message.status === "failed" && message.retryOfMessageId
    ? `<button class="chat-retry-button" data-retry-chat="${escapeAttribute(message.retryOfMessageId)}" type="button">נסה שוב</button>`
    : "";
  return `<div class="chat-message ${message.role} ${message.status || "complete"}" dir="auto"><span>${escapeHtml(message.text)}</span>${retry}<time>${escapeHtml(shortDate(message.createdAt))}</time></div>`;
}

function renderMessageProposals(project, message) {
  const proposals = (message.proposalIds || []).map((id) => project.proposals?.find((item) => item.id === id)).filter(Boolean);
  return proposals.map((proposal) => {
    const paths = proposal.changes?.map((change) => change.path) || (proposal.path ? proposal.path.split(",").map((path) => path.trim()).filter(Boolean) : []);
    const changedSections = paths.length ? `<ul>${paths.map((path) => `<li>${escapeHtml(documentPathLabel(path))}</li>`).join("")}</ul>` : "";
    return `<section class="proposal-card ${proposal.status}">
    <strong>${proposal.target === "document" ? `שינוי מאוחד במסמך${paths.length ? ` · ${paths.length} חלקים` : ""}` : "כלל עבודה לפרויקט הנוכחי בלבד"}</strong>
    <p dir="auto">${escapeHtml(proposal.reason)}</p>
    ${proposal.target === "document" ? changedSections : ""}
    ${proposal.target === "projectRule" ? `<blockquote dir="auto">${escapeHtml(proposal.rule)}</blockquote>` : ""}
    ${proposal.status === "pending" ? `<div><button class="primary-button" data-apply-proposal="${proposal.id}" type="button">אישור והחלה</button><button class="secondary-button" data-reject-proposal="${proposal.id}" type="button">דחייה</button></div>` : `<small>${proposal.status === "applied" ? "אושר והוחל" : "נדחה"}</small>`}
  </section>`;
  }).join("");
}

function documentPathLabel(path) {
  return ({ subject: "נושא המסמך", background: "רקע", objective: "מטרת המסמך", scope: "תכולת הפרויקט", estimateNotes: "הערות לאומדן", scheduleRows: "לוח זמנים", scheduleNotes: "הערות ללוח הזמנים", riskRows: "ניהול סיכונים", additionalNotes: "הערות נוספות", boqRows: "כתב כמויות", evidenceNotes: "הערות והנחות מקצועיות" })[path] || path;
}

function renderVersions() {
  const versions = getActiveProject().versions;
  elements.versionsList.innerHTML = versions.length
    ? [...versions]
        .reverse()
        .map(
          (version) => `<div class="version-item"><div><strong>${escapeHtml(version.label)}</strong><span>${escapeHtml(shortDate(version.createdAt))}</span></div><button class="secondary-button" data-restore-version="${version.id}" type="button">שחזור</button></div>`,
        )
        .join("")
    : '<p class="muted">עדיין לא נשמרו גרסאות. השמירה השוטפת קיימת, וגרסה מאפשרת לחזור לנקודת זמן מסוימת.</p>';
}

async function openMaterialDialog(materialId, sourceContext) {
  const material = getActiveProject().materials.find((item) => item.id === materialId);
  if (!material) return;
  selectedMaterialId = materialId;
  selectedMaterialContent = null;
  elements.materialDialogTitle.textContent = material.name;
  elements.materialDetails.innerHTML = [
    ["מצב", materialSummary(material)],
    ["סוג", material.type || "לא זוהה"],
    ["גודל", formatFileSize(material.size)],
    ["נוסף", shortDate(material.addedAt)],
    ...(material.pageCount ? [["עמודים", String(material.pageCount)]] : []),
    ...(material.sheetCount ? [["גיליונות", String(material.sheetCount)]] : []),
    ...(material.videoDurationSeconds ? [["משך וידאו", formatDuration(material.videoDurationSeconds)]] : []),
    ...(material.videoFrameCount ? [["פריימים לניתוח", String(material.videoFrameCount)]] : []),
    ...(material.correctedAt ? [["תיקון אחרון", shortDate(material.correctedAt)]] : []),
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const baseMessage = material.status === "error"
    ? "הקריאה נכשלה. אפשר לנסות לקרוא את הקובץ מחדש או להחליף אותו."
    : material.status === "unsupported"
      ? "הקובץ נשמר בפרויקט, אך הפורמט אינו נתמך לקריאה אוטומטית."
      : "הקובץ נשמר רק בפרויקט הנוכחי וזמין לצ׳אט.";
  const sourceMessage = sourceContext
    ? [sourceContext.location && `מיקום: ${sourceContext.location}`, sourceContext.excerpt && `ציטוט: ${sourceContext.excerpt}`].filter(Boolean).join("\n")
    : "";
  elements.materialDialogMessage.textContent = [baseMessage, sourceMessage].filter(Boolean).join("\n\n");
  renderMaterialPreview(material);
  elements.materialContentEditor.value = "";
  elements.materialContentEditor.disabled = true;
  elements.materialContentStatus.textContent = "טוען את התוכן שנקרא...";
  document.querySelector("#reset-material-content-button").disabled = true;
  document.querySelector("#analyze-material-button").disabled = material.status !== "ready" || (!material.visionImageCount && !material.hasTextContent);
  document.querySelector("#reprocess-material-button").disabled = material.status === "processing";
  elements.materialDialog.showModal();
  try {
    const { content } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(materialId)}/content`);
    if (selectedMaterialId !== materialId) return;
    showMaterialContent(content);
  } catch (error) {
    elements.materialContentStatus.textContent = `לא ניתן להציג את התוכן: ${error.message}`;
  }
}

function showMaterialContent(content) {
  selectedMaterialContent = content;
  elements.materialContentEditor.value = content.effectiveText || "";
  elements.materialContentEditor.disabled = false;
  elements.materialContentStatus.textContent = content.hasCorrection
    ? content.correctionNeedsReview ? "יש תיקון שמור; לאחר קריאה מחדש מומלץ לבדוק אותו" : "מוצג תיקון שנשמר על ידך"
    : content.analysisText ? "מוצגים החילוץ המקורי וניתוח Codex" : content.originalText ? "מוצגת הקריאה האוטומטית המקורית" : "אין עדיין טקסט; אפשר להקליד ידנית או להפעיל פענוח עם Codex";
  document.querySelector("#reset-material-content-button").disabled = !content.hasCorrection;
}

function renderMaterialPreview(material) {
  const source = `/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(material.id)}/preview`;
  if (/^video\//i.test(material.type)) {
    elements.materialPreview.innerHTML = `<video controls preload="metadata" src="${source}" aria-label="תצוגת וידאו ${escapeHtml(material.name)}"></video>`;
    elements.materialPreview.hidden = false;
  } else if (/^image\//i.test(material.type)) {
    elements.materialPreview.innerHTML = `<img src="${source}" alt="תצוגת ${escapeHtml(material.name)}" />`;
    elements.materialPreview.hidden = false;
  } else {
    elements.materialPreview.innerHTML = "";
    elements.materialPreview.hidden = true;
  }
}

async function openDekelReview() {
  if (!ensureProjectReadyForExport()) return;
  if (!elements.dekelDialog.open) elements.dekelDialog.showModal();
  elements.dekelCatalogStatus.textContent = "טוען את מחירון DEKEL...";
  elements.dekelLines.innerHTML = managementSkeleton();
  elements.dekelWarnings.innerHTML = "";
  elements.dekelFinancialAudit.innerHTML = "";
  elements.dekelReviewSummary.textContent = "";
  elements.dekelApplyButton.disabled = true;
  try {
    const result = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/dekel`);
    currentDekelCatalog = result.catalog;
    if (!result.catalog.exists) {
      elements.dekelCatalogStatus.textContent = "מחירון DEKEL הקבוע של המערכת אינו זמין";
      elements.dekelLines.innerHTML = '<div class="empty-state error-state"><strong>מחירון DEKEL הקבוע של המערכת אינו זמין</strong><span>נדרשת בדיקת קובץ המערכת; אין צורך להעלות אותו לפרויקט.</span></div>';
      return;
    }
    if (result.review) renderDekelReview(result.review);
    else await analyzeDekelReview();
  } catch (error) {
    elements.dekelCatalogStatus.textContent = "טעינת DEKEL נכשלה";
    elements.dekelLines.innerHTML = `<div class="empty-state error-state"><strong>${escapeHtml(error.message)}</strong><button class="secondary-button" data-retry-dekel type="button">נסה שוב</button></div>`;
  }
}

async function analyzeDekelReview(button = document.querySelector("#dekel-analyze-button")) {
  const result = await runAction(button, "מתאים שורות...", async () => await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/dekel/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  if (!result.ok) return;
  replaceProject(result.value.project);
  renderDekelReview(result.value.review);
}

function renderDekelReview(review) {
  const catalog = currentDekelCatalog;
  elements.dekelCatalogStatus.textContent = `${review.workbookFileName} · ${formatQuantity(review.billableRowsCount)} שורות מחיר ללא מע״מ`;
  elements.dekelWarnings.innerHTML = review.warnings?.length
    ? `<details open><summary>${review.warnings.length} הערות לבדיקה</summary><ul>${review.warnings.map((warning) => `<li dir="auto">${escapeHtml(warning)}</li>`).join("")}</ul></details>`
    : '<div class="dekel-clean-status">כל שורות העבודה קיבלו התאמת DEKEL.</div>';
  renderDekelFinancialAudit(review.financialAudit);
  elements.dekelLines.innerHTML = review.lines.length
    ? review.lines.map((line, index) => renderDekelReviewLine(line, index, review.status)).join("")
    : '<div class="empty-state"><strong>אין שורות לבדיקה</strong><span>הוסף עבודות לכתב הכמויות והריץ התאמה מחדש.</span></div>';
  const includedLines = review.lines.filter((line) => line.included);
  const unresolvedLines = review.lines.filter((line) => !line.included && !line.ownerExcluded);
  const ownerExcludedLines = review.lines.filter((line) => line.ownerExcluded);
  const selectedCount = includedLines.filter((line) => {
    const selected = line.candidates.find((candidate) => candidate.code === line.selectedCode);
    return selected && selected.unitCompatibility !== "mismatch";
  }).length;
  elements.dekelReviewSummary.textContent = review.status === "applied"
    ? `הבדיקה הוחלה על המסמך · ${shortDate(review.appliedAt)}`
    : `${selectedCount} שורות DEKEL מוכנות${unresolvedLines.length ? ` · ${unresolvedLines.length} ממתינות להתאמה` : ""}${ownerExcludedLines.length ? ` · ${ownerExcludedLines.length} הוחרגו במפורש` : ""}`;
  elements.dekelApplyButton.disabled = review.status !== "ready" || selectedCount === 0 || selectedCount !== includedLines.length || unresolvedLines.length > 0 || !review.financialAudit?.valid;
  elements.dekelApplyButton.textContent = review.status === "applied" ? "הוחל על המסמך" : "החלה על כתב הכמויות";
  if (catalog?.rowsCount && !review.workbookRowsCount) review.workbookRowsCount = catalog.rowsCount;
}

function renderDekelReviewLine(line, index, reviewStatus) {
  const selected = line.candidates.find((candidate) => candidate.code === line.selectedCode) || line.candidates[0];
  const disabled = reviewStatus !== "ready" ? "disabled" : "";
  const semanticConfidence = ({ high: 90, medium: 60, low: 30 })[line.semanticConfidence];
  const confidence = semanticConfidence ?? (selected ? Math.round(selected.score * 100) : 0);
  return `<article class="dekel-review-line ${line.included ? "included" : "excluded"}" data-dekel-line="${escapeAttribute(line.id)}">
    <header>
      <label class="dekel-include"><input type="checkbox" data-dekel-included ${line.included ? "checked" : ""} ${disabled} /><span>${index + 1}</span></label>
      <div><strong>${escapeHtml(line.workDescription)}</strong><span>מקור הכמות: ${escapeHtml(dekelQuantitySourceLabel(line.quantitySource))}${line.selectionMethod === "codex_constrained" ? " · התאמה סמנטית מוגבלת למועמדי DEKEL" : ""}</span></div>
      <span class="dekel-confidence ${confidence >= 75 ? "high" : confidence >= 45 ? "medium" : "low"}">${confidence}%</span>
    </header>
    ${line.candidates.length ? `<div class="dekel-line-fields">
      <label>קוד DEKEL<input data-dekel-code list="dekel-candidates-${escapeAttribute(line.id)}" value="${escapeAttribute(line.selectedCode || "")}" ${disabled} /><datalist id="dekel-candidates-${escapeAttribute(line.id)}">${line.candidates.map((candidate) => `<option value="${escapeAttribute(candidate.code)}">${escapeHtml(formatDekelUnit(candidate.unit))} · ${formatMoney(candidate.unitPrice)}</option>`).join("")}</datalist></label>
      <label>כמות<input type="number" min="0.01" step="0.01" value="${line.quantity}" data-dekel-quantity ${disabled} /></label>
    </div>
    <div class="dekel-selected-detail"><strong>${escapeHtml(selected.description)}</strong><span>מחיר יחידה ללא מע״מ: ${formatMoney(selected.unitPrice)} · יחידה: ${escapeHtml(formatDekelUnit(selected.unit))} · פרק ${escapeHtml(selected.sourceChapterCode || "—")} · שורת מקור ${escapeHtml(selected.sourceRow || "—")} · התאמת יחידה: ${escapeHtml(dekelUnitCompatibilityLabel(selected.unitCompatibility))}</span></div>`
    : '<div class="dekel-no-match">לא נמצאה התאמה. השורה לא תוחל עד לבחירת מחיר תקין.</div>'}
  </article>`;
}

function renderDekelFinancialAudit(audit) {
  if (!audit) {
    elements.dekelFinancialAudit.innerHTML = '<div class="dekel-audit-failed">נדרשת הרצת התאמה מחדש כדי לבצע ביקורת כספית מלאה.</div>';
    return;
  }
  const fee = (key) => audit.fees?.find((item) => item.key === key)?.amount || 0;
  elements.dekelFinancialAudit.innerHTML = `<header><strong>${audit.valid ? "הביקורת הכספית עברה בהצלחה" : "הביקורת הכספית נכשלה"}</strong><span>${audit.valid ? "כל הסכומים תואמים עד האגורה" : escapeHtml((audit.failedChecks || []).join(", "))}</span></header>
    <dl>
      <div><dt>לפני מע״מ</dt><dd>${formatMoney(audit.subtotalNet)}</dd></div>
      <div><dt>מע״מ 18%</dt><dd>${formatMoney(audit.vat)}</dd></div>
      <div><dt>ביצוע כולל מע״מ</dt><dd>${formatMoney(audit.totalWithVat)}</dd></div>
      <div><dt>תכנון 7.4%</dt><dd>${formatMoney(fee("planning"))}</dd></div>
      <div><dt>תפעול וניהול 5.4%</dt><dd>${formatMoney(fee("management"))}</dd></div>
      <div><dt>פיקוח 2.7%</dt><dd>${formatMoney(fee("supervision"))}</dd></div>
      <div class="grand"><dt>סה״כ פרויקט</dt><dd>${formatMoney(audit.grandTotal)}</dd></div>
    </dl>`;
  elements.dekelFinancialAudit.classList.toggle("failed", !audit.valid);
}

function formatDekelUnit(unit) {
  return formatBoqUnit(unit) || "—";
}

function formatBoqUnit(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[׳']/gu, "'").replace(/[״]/gu, '"').replace(/\s+/gu, " ");
  if (/^(unit|units|יח|יח'|יחידה|יחידות)$/u.test(normalized)) return "יח׳";
  if (/^(m|m1|meter|metre|meters|metres|מ|מ'|מטר|מטרים)$/u.test(normalized)) return "מ׳";
  if (/^(m2|m²|sqm|מ"ר|מטר רבוע|מטרים רבועים)$/u.test(normalized)) return "מ״ר";
  if (/^(m3|m³|cbm|מ"ק|מטר מעוקב|מטרים מעוקבים)$/u.test(normalized)) return "מ״ק";
  if (/^(complete|com|קומ|קומפ|קומפ'|קומפלט)$/u.test(normalized)) return "קומפ׳";
  if (/^(point|points|נק|נק'|נקודה|נקודות)$/u.test(normalized)) return "נק׳";
  if (/^(hour|hours|hr|hrs|שעה|שעות)$/u.test(normalized)) return "שעה";
  if (/^(day|days|יום|ימים)$/u.test(normalized)) return "יום";
  if (/^(kg|kgs|קג|ק"ג|קילוגרם|קילוגרמים)$/u.test(normalized)) return "ק״ג";
  if (/^(ton|tons|tonne|tonnes|טון|טונות)$/u.test(normalized)) return "טון";
  if (/^(pair|pairs|זוג|זוגות)$/u.test(normalized)) return "זוג";
  return raw;
}

function dekelUnitCompatibilityLabel(value) {
  return ({ exact: "זהה", compatible: "תואמת", corrected_by_code: "תתוקן לפי הקוד", mismatch: "אינה תואמת", unknown: "לא ידועה" })[value] || "לא ידועה";
}

function dekelQuantitySourceLabel(source) {
  return ({ document: "כתב הכמויות הנוכחי", material: "חומרי הפרויקט", estimated: "הערכה מקצועית" })[source] || source;
}

async function loadSystemCenter() {
  elements.backupsList.innerHTML = managementSkeleton();
  elements.archivedProjectsList.innerHTML = managementSkeleton();
  document.querySelector("#storage-health-status").textContent = "בודק...";
  document.querySelector("#system-codex-status").textContent = "בודק...";
  try {
    const [health, backupResult, archiveResult, codex] = await Promise.all([
      requestJson("/local/health"),
      requestJson("/local/backups"),
      requestJson("/local/archived-projects"),
      requestJson("/local/codex/status"),
    ]);
    const healthy = health.writable && health.corruptEntries.length === 0;
    document.querySelector("#storage-health-status").textContent = healthy ? "תקין ונגיש" : "נדרשת בדיקה";
    document.querySelector("#storage-health-status").className = healthy ? "status-good" : "status-danger";
    document.querySelector("#active-projects-count").textContent = String(health.activeProjects);
    document.querySelector("#system-codex-status").textContent = codex.connected ? "מחובר" : "נדרש קישור";
    document.querySelector("#system-codex-status").className = codex.connected ? "status-good" : "status-warning";
    renderBackups(backupResult.backups);
    renderArchivedProjects(archiveResult.projects);
  } catch (error) {
    elements.backupsList.innerHTML = retryState("לא הצלחנו לטעון את מצב המערכת");
    elements.archivedProjectsList.innerHTML = retryState("לא הצלחנו לטעון את הארכיון");
    showToast(error.message, "error", 5000);
  }
}

function renderBackups(backups) {
  elements.backupsList.innerHTML = backups.length
    ? backups.map((backup) => `<article class="management-item">
        <div><strong dir="auto">${escapeHtml(backup.label)}</strong><span>${escapeHtml(shortDate(backup.createdAt))} · ${escapeHtml(backupKindLabel(backup.kind))} · ${backup.projectCount} פרויקטים</span></div>
        <button class="secondary-button" data-restore-backup="${backup.id}" type="button">שחזור</button>
      </article>`).join("")
    : '<div class="empty-state"><strong>אין עדיין גיבויים</strong><span>צור גיבוי ידני לפני שינוי חשוב.</span></div>';
}

function renderArchivedProjects(archivedProjects) {
  elements.archivedProjectsList.innerHTML = archivedProjects.length
    ? archivedProjects.map((project) => `<article class="management-item">
        <div><strong dir="auto">${escapeHtml(project.name)}</strong><span>${escapeHtml(shortDate(project.updatedAt))}</span></div>
        <button class="secondary-button" data-restore-archived="${project.id}" type="button">החזרה לפרויקטים</button>
      </article>`).join("")
    : '<div class="empty-state"><strong>הארכיון ריק</strong><span>פרויקטים מועברים לכאן ללא מחיקה.</span></div>';
}

function managementSkeleton() {
  return '<div class="management-skeleton" aria-hidden="true"></div><div class="management-skeleton" aria-hidden="true"></div>';
}

function retryState(message) {
  return `<div class="empty-state error-state"><strong>${escapeHtml(message)}</strong><button class="secondary-button" data-retry-system type="button">נסה שוב</button></div>`;
}

function backupKindLabel(kind) {
  return ({ automatic: "אוטומטי", manual: "ידני", safety: "גיבוי ביטחון" })[kind] || kind;
}

async function saveVersion(label = "גרסה ידנית") {
  const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
  });
  replaceProject(project);
  renderVersions();
  showToast("גרסת המסמך נשמרה מקומית");
}

async function handleFiles(files) {
  elements.saveIndicator.textContent = "קורא חומרים...";
  elements.saveIndicator.classList.add("saving");
  elements.materialInput.disabled = true;
  const failures = [];
  let completed = 0;
  for (const file of files) {
    elements.saveIndicator.textContent = `קורא ${completed + 1} מתוך ${files.length}: ${file.name}`;
    try {
      const result = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      replaceProject(result.project);
      if (/^video\//i.test(file.type) || /\.(mp4|m4v|mov|webm)$/i.test(file.name)) {
        elements.saveIndicator.textContent = `מכין פריימים מהווידאו: ${file.name}`;
        const project = await prepareVideoFrames(file, result.material.id);
        if (project) replaceProject(project);
      }
      completed += 1;
      renderMaterials();
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }
  elements.materialInput.disabled = false;
  elements.saveIndicator.className = failures.length ? "save-indicator error" : "save-indicator";
  elements.saveIndicator.textContent = failures.length ? `${completed} קבצים נוספו, ${failures.length} נכשלו` : "החומרים נשמרו; מתחיל ניתוח מקצועי מלא";
  if (completed > 0) await startProjectProcessing(activeProjectId);
  showToast(
    failures.length ? `${completed} קבצים נוספו. ${failures[0]}` : `${completed} קבצים נשמרו והעיבוד המלא התחיל`,
    failures.length ? "error" : "success",
    failures.length ? 6000 : 3000,
  );
}

async function startProjectProcessing(projectId) {
  const { processing } = await requestJson(`/local/projects/${encodeURIComponent(projectId)}/processing-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "full", replaceDocument: true }),
  });
  const project = projects.find((item) => item.id === projectId);
  if (project) project.processing = processing;
  renderAll();
  void pollProjectProcessing(projectId);
  return processing;
}

function resumeProjectProcessing(project = getActiveProject()) {
  if (!project || !["queued", "running"].includes(projectProcessingState(project).status) || processingPolls.has(project.id)) return;
  void pollProjectProcessing(project.id);
}

function pollProjectProcessing(projectId) {
  const existing = processingPolls.get(projectId);
  if (existing) return existing;
  const polling = (async () => {
    for (let attempt = 0; attempt < 1_200; attempt += 1) {
      await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 750));
      const { processing } = await requestJson(`/local/projects/${encodeURIComponent(projectId)}/processing`);
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      project.processing = processing;
      if (projectId === activeProjectId) renderProjectProcessing(project);
      if (["ready", "needs_review", "failed", "stale"].includes(processing.status)) {
        const { project: refreshed } = await requestJson(`/local/projects/${encodeURIComponent(projectId)}`);
        replaceProject(refreshed);
        if (projectId === activeProjectId) renderAll();
        showToast(processing.status === "ready" ? "העיבוד הושלם והמסמך מוכן לבדיקה" : "העיבוד הסתיים אך נדרשת בדיקה או השלמה", processing.status === "ready" ? "success" : "error", 6000);
        return;
      }
    }
  })();
  processingPolls.set(projectId, polling);
  void polling.finally(() => {
    if (processingPolls.get(projectId) === polling) processingPolls.delete(projectId);
  });
  return polling;
}

async function prepareVideoFrames(file, materialId) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = objectUrl;
  try {
    if (video.readyState < 1) await waitForMediaEvent(video, "loadedmetadata", 15_000);
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error("לא ניתן לקרוא את משך הווידאו או את ממדי התמונה");
    const frameCount = Math.min(12, Math.max(3, Math.ceil(duration / 15) + 2));
    const timestamps = Array.from({ length: frameCount }, (_, index) => Math.min(duration - 0.05, duration * ((index + 0.5) / frameCount)));
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("הדפדפן לא הצליח להכין פריימים מהווידאו");
    let latestProject;
    for (const timestamp of timestamps) {
      await seekVideo(video, Math.max(0, timestamp), 15_000);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = await canvasToJpeg(canvas);
      const result = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(materialId)}/video-frames?timestampSeconds=${encodeURIComponent(timestamp)}&durationSeconds=${encodeURIComponent(duration)}`, {
        method: "POST", headers: { "Content-Type": "image/jpeg" }, body: frame,
      });
      latestProject = result.project;
    }
    return latestProject;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function seekVideo(video, timestamp, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("תם הזמן להכנת פריים מהווידאו")), timeoutMs);
    const onSuccess = () => finish();
    const onError = () => finish(new Error("לא ניתן לעבור לנקודה שנבחרה בווידאו"));
    const finish = (error) => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSuccess);
      video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    video.addEventListener("seeked", onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timestamp;
  });
}

function waitForMediaEvent(media, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("תם הזמן לקריאת הווידאו")), timeoutMs);
    const onSuccess = () => finish();
    const onError = () => finish(new Error("הדפדפן לא הצליח לקרוא את קובץ הווידאו"));
    const finish = (error) => {
      window.clearTimeout(timer);
      media.removeEventListener(eventName, onSuccess);
      media.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    media.addEventListener(eventName, onSuccess, { once: true });
    media.addEventListener("error", onError, { once: true });
  });
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("יצירת פריים מהווידאו נכשלה")), "image/jpeg", 0.84));
}

async function downloadMaterial(materialId) {
  const link = document.createElement("a");
  link.href = `/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(materialId)}`;
  link.click();
}

function addChatMessage(role, text) {
  getActiveProject().chat.push({ id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString(), status: "complete" });
  renderChat();
}

async function exportHtml() {
  if (!ensureProjectReadyForExport()) return;
  if (!ensureA4LayoutReady()) return;
  const css = await fetch("/styles.css").then((response) => response.text());
  const clone = elements.documentStage.querySelector("#printable-document").cloneNode(true);
  clone.querySelectorAll(".document-controls, .delete-row-button, .evidence-overview").forEach((node) => node.remove());
  clone.querySelectorAll(".narrative-page").forEach((node) => { node.style.zoom = ""; });
  clone.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
  clone.querySelectorAll("input").forEach((input) => {
    const text = document.createElement("span");
    text.textContent = input.value;
    input.replaceWith(text);
  });
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(getActiveProject().name)}</title><style>${css}</style></head><body class="exported-document"><main class="document-stage">${clone.outerHTML}</main></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(getActiveProject().name)}.html`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("קובץ HTML מקומי נוצר");
}

function showToast(message, tone = "success", duration = 3000) {
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.setAttribute("role", tone === "error" ? "alert" : "status");
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), duration);
}

async function runAction(button, busyLabel, action) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (busyLabel) button.textContent = busyLabel;
  }
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    showToast(error.message, "error", 5000);
    return { ok: false, error };
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalText;
    }
  }
}

function requestConfirmation({ title, message, confirmLabel = "אישור", tone = "danger" }) {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-message").textContent = message;
  const actionButton = document.querySelector("#confirm-action-button");
  actionButton.textContent = confirmLabel;
  actionButton.className = tone === "danger" ? "danger-button" : "primary-button";
  elements.confirmDialog.showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function materialSummary(material) {
  if (material.status === "processing") return "קורא את הקובץ...";
  if (material.status === "error") return "שגיאה בקריאת הקובץ";
  if (material.status === "unsupported") return material.name.toLowerCase().endsWith(".xls") ? "יש לשמור מחדש כ־XLSX" : "הקובץ נשמר; קריאה אוטומטית אינה זמינה";
  if (material.pageCount) return `${material.pageCount} עמודים נקראו${material.visionImageCount ? " כולל קריאה חזותית" : ""}`;
  if (material.sheetCount) return `${material.sheetCount} גיליונות נקראו`;
  if (/^image\//.test(material.type)) return "מוכן לניתוח חזותי";
  if (/^video\//.test(material.type)) return material.videoFrameCount ? `${material.videoFrameCount} פריימים מוכנים לניתוח` : "הווידאו נשמר; מכין פריימים";
  return "הקובץ נקרא ומוכן לצ'אט";
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatMoney(value) {
  return `₪ ${moneyFormatter.format(Number(value) || 0)}`;
}

function formatQuantity(value) {
  return quantityFormatter.format(Number(value) || 0);
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function shortDate(value) {
  try { return dateFormatter.format(new Date(value)); } catch { return ""; }
}

function safeFileName(value) {
  return value.replace(/[<>:"/\\|?*]+/g, "-").trim() || "mashmauet-document";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

document.querySelector("#new-project-button").addEventListener("click", () => elements.projectDialog.showModal());
document.querySelector("#versions-button").addEventListener("click", () => { renderVersions(); elements.versionsDialog.showModal(); });
document.querySelector("#dekel-review-button").addEventListener("click", openDekelReview);
document.querySelector("#dekel-analyze-button").addEventListener("click", async (event) => await analyzeDekelReview(event.currentTarget));
document.querySelector("#create-version-button").addEventListener("click", async (event) => {
  await runAction(event.currentTarget, "שומר...", async () => saveVersion());
});
document.querySelector("#connect-codex-button").addEventListener("click", () => elements.codexDialog.showModal());
document.querySelector("#start-codex-login-button").addEventListener("click", connectCodex);
document.querySelector("#print-button").addEventListener("click", () => {
  if (!ensureProjectReadyForExport()) return;
  if (!ensureA4LayoutReady()) return;
  window.print();
});
document.querySelector("#document-focus-button").addEventListener("click", (event) => {
  const active = document.body.classList.toggle("document-focus");
  event.currentTarget.setAttribute("aria-pressed", String(active));
  event.currentTarget.textContent = active ? "חזרה לסביבת העבודה" : "תצוגת מסמך מלאה";
  requestAnimationFrame(() => {
    fitDocumentPreview();
    elements.documentStage.scrollLeft = 0;
    window.scrollTo({ left: 0 });
  });
});
window.addEventListener("resize", () => {
  fitDocumentPreview();
  scheduleA4LayoutCheck();
});
document.querySelector("#export-button").addEventListener("click", async (event) => {
  await runAction(event.currentTarget, "מייצא...", exportHtml);
});
elements.retryWorkflowButton.addEventListener("click", async (event) => {
  const result = await runAction(event.currentTarget, "מפעיל עיבוד מלא...", async () => await startProjectProcessing(activeProjectId));
  if (result.ok) showToast("העיבוד המלא הופעל מחדש");
});
document.querySelector("#system-center-button").addEventListener("click", async () => {
  elements.systemDialog.showModal();
  await loadSystemCenter();
});
document.querySelector("#project-settings-button").addEventListener("click", () => {
  const project = getActiveProject();
  document.querySelector("#settings-project-name").value = project.name;
  document.querySelector("#settings-project-description").value = project.description;
  const archiveButton = document.querySelector("#archive-project-button");
  archiveButton.disabled = projects.length <= 1;
  archiveButton.title = projects.length <= 1 ? "לא ניתן להעביר לארכיון את הפרויקט הפעיל היחיד" : "";
  elements.projectSettingsDialog.showModal();
});
document.querySelector("#refresh-system-button").addEventListener("click", async (event) => {
  await runAction(event.currentTarget, "מרענן...", loadSystemCenter);
});
document.querySelector("#create-backup-button").addEventListener("click", async (event) => {
  const result = await runAction(event.currentTarget, "יוצר גיבוי...", async () => {
    await requestJson("/local/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: `גיבוי ידני ${shortDate(new Date().toISOString())}` }),
    });
    await loadSystemCenter();
  });
  if (result.ok) showToast("הגיבוי נוצר ונבדק בהצלחה");
});

document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

elements.confirmForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const confirmed = event.submitter?.value === "confirm";
  elements.confirmDialog.close();
  confirmResolver?.(confirmed);
  confirmResolver = undefined;
});
elements.confirmDialog.addEventListener("cancel", () => {
  confirmResolver?.(false);
  confirmResolver = undefined;
});

elements.editButton.addEventListener("click", async (event) => {
  if (!editing) {
    const result = await runAction(event.currentTarget, "מכין עריכה...", async () => saveVersion("גרסה לפני עריכה"));
    if (!result.ok) return;
    editing = true;
    elements.editButton.textContent = "שמירה";
    renderDocument();
    showToast("מצב עריכה פעיל. השדות הצהובים ניתנים לשינוי.");
    return;
  }
  window.clearTimeout(saveTimer);
  const result = await runAction(event.currentTarget, "שומר...", persistProjects);
  if (!result.ok) return;
  editing = false;
  elements.editButton.textContent = "עריכה";
  renderDocument();
  elements.saveIndicator.textContent = "כל השינויים נשמרו";
  elements.saveIndicator.className = "save-indicator";
  showToast("השינויים נשמרו");
});

elements.projectSearch.addEventListener("input", renderProjects);
document.querySelector(".mobile-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-view]");
  if (!button) return;
  document.body.dataset.mobileView = button.dataset.mobileView;
  document.querySelectorAll(".mobile-nav [data-mobile-view]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.projectList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-id]");
  if (!button) return;
  activeProjectId = button.dataset.projectId;
  editing = false;
  elements.editButton.textContent = "עריכה";
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
  renderAll();
  resumeProjectProcessing(getActiveProject());
  if (window.matchMedia("(max-width: 900px)").matches) {
    document.querySelector('.mobile-nav [data-mobile-view="document"]').click();
  }
});

elements.materialInput.addEventListener("change", async () => {
  try {
    if (elements.materialInput.files?.length) await handleFiles([...elements.materialInput.files]);
  } finally { elements.materialInput.value = ""; }
});

elements.materialList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-material]");
  if (deleteButton) {
    const id = deleteButton.dataset.deleteMaterial;
    const material = getActiveProject().materials.find((item) => item.id === id);
    const confirmed = await requestConfirmation({ title: "מחיקת חומר", message: `הקובץ „${material?.name || ""}” יימחק מהפרויקט. פעולה זו אינה חלק מארכיון הפרויקט.`, confirmLabel: "מחיקת הקובץ" });
    if (!confirmed) return;
    const result = await runAction(deleteButton, "...", async () => {
      const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
      replaceProject(project);
      renderMaterials();
    });
    if (result.ok) showToast("החומר נמחק מהפרויקט");
    return;
  }
  const item = event.target.closest("[data-material-id]");
  if (item) openMaterialDialog(item.dataset.materialId);
});

elements.projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#project-name").value.trim();
  const description = document.querySelector("#project-description").value.trim();
  if (!name || !description) return;
  const initialFiles = [...(document.querySelector("#project-files").files || [])];
  const submitButton = event.submitter;
  const result = await runAction(submitButton, "פותח פרויקט...", async () => {
    const { project } = await requestJson("/local/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }),
    });
    projects.unshift(project);
    activeProjectId = project.id;
    if (initialFiles.length) await handleFiles(initialFiles);
    elements.projectForm.reset();
    elements.projectDialog.close();
    renderAll();
  });
  if (result.ok && !initialFiles.length) showToast("הפרויקט נפתח ונשמר מקומית");
});

elements.projectSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#settings-project-name").value.trim();
  const description = document.querySelector("#settings-project-description").value.trim();
  if (!name || !description) return;
  const result = await runAction(event.submitter, "שומר...", async () => {
    const current = getActiveProject();
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(current.id)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, document: current.document }),
    });
    replaceProject(project);
    elements.projectSettingsDialog.close();
    renderAll();
  });
  if (result.ok) showToast("פרטי הפרויקט נשמרו");
});

document.querySelector("#archive-project-button").addEventListener("click", async (event) => {
  const project = getActiveProject();
  const confirmed = await requestConfirmation({ title: "העברת פרויקט לארכיון", message: `הפרויקט „${project.name}” יוסר מרשימת העבודה ויישמר בארכיון. לפני ההעברה ייווצר גיבוי ביטחון.`, confirmLabel: "העברה לארכיון" });
  if (!confirmed) return;
  const result = await runAction(event.currentTarget, "מעביר...", async () => {
    await requestJson(`/local/projects/${encodeURIComponent(project.id)}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    await reloadProjects();
    elements.projectSettingsDialog.close();
    renderAll();
  });
  if (result.ok) showToast("הפרויקט הועבר לארכיון ונוצר גיבוי ביטחון");
});

document.querySelector("#download-material-button").addEventListener("click", () => {
  if (selectedMaterialId) downloadMaterial(selectedMaterialId);
});

document.querySelector("#save-material-content-button").addEventListener("click", async (event) => {
  if (!selectedMaterialId) return;
  const result = await runAction(event.currentTarget, "שומר תיקון...", async () => {
    const response = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(selectedMaterialId)}/content`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: elements.materialContentEditor.value }),
    });
    replaceProject(response.project);
    renderMaterials();
    showMaterialContent(response.content);
  });
  if (result.ok) showToast("התיקון נשמר וישמש את צ׳אט הפרויקט בעדיפות ראשונה");
});

document.querySelector("#reset-material-content-button").addEventListener("click", async (event) => {
  if (!selectedMaterialId) return;
  const result = await runAction(event.currentTarget, "מחזיר מקור...", async () => {
    const response = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(selectedMaterialId)}/content`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: null }),
    });
    replaceProject(response.project);
    renderMaterials();
    showMaterialContent(response.content);
  });
  if (result.ok) showToast("התיקון הוסר והקריאה המקורית שוב פעילה");
});

document.querySelector("#analyze-material-button").addEventListener("click", async (event) => {
  if (!selectedMaterialId) return;
  const result = await runAction(event.currentTarget, "Codex מפענח...", async () => {
    const response = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(selectedMaterialId)}/analyze`, { method: "POST" });
    replaceProject(response.project);
    renderMaterials();
    showMaterialContent(response.content);
  });
  if (result.ok) showToast("החומר פוענח. אפשר לבדוק ולתקן את התוצאה לפני השימוש בצ׳אט.", "success", 5000);
});

document.querySelector("#discuss-material-button").addEventListener("click", () => {
  const material = getActiveProject().materials.find((item) => item.id === selectedMaterialId);
  if (!material) return;
  const prompt = `אני רוצה לדון בחומר „${material.name}”. הסתמך על התוכן שנקרא ועל התיקונים ששמרתי, הסבר מה מובן ממנו, אילו עבודות מפורשות ואילו עבודות נדרשות במשתמע.`;
  elements.chatInput.value = prompt;
  elements.materialDialog.close();
  if (window.matchMedia("(max-width: 900px)").matches) document.querySelector('.mobile-nav [data-mobile-view="chat"]').click();
  elements.chatInput.focus();
  elements.chatInput.setSelectionRange(prompt.length, prompt.length);
});

document.querySelector("#reprocess-material-button").addEventListener("click", async (event) => {
  if (!selectedMaterialId) return;
  const result = await runAction(event.currentTarget, "קורא מחדש...", async () => {
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(selectedMaterialId)}/reprocess`, { method: "POST" });
    replaceProject(project);
    renderMaterials();
    const material = project.materials.find((item) => item.id === selectedMaterialId);
    if (material) {
      elements.materialDialog.close();
      await openMaterialDialog(material.id);
    }
  });
  if (result.ok) showToast("הקובץ נקרא מחדש והחומר עודכן");
});

document.querySelector("#delete-material-button").addEventListener("click", async (event) => {
  const material = getActiveProject().materials.find((item) => item.id === selectedMaterialId);
  if (!material) return;
  const confirmed = await requestConfirmation({ title: "מחיקת חומר", message: `הקובץ „${material.name}” יימחק מהפרויקט.`, confirmLabel: "מחיקת הקובץ" });
  if (!confirmed) return;
  const result = await runAction(event.currentTarget, "מוחק...", async () => {
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/materials/${encodeURIComponent(selectedMaterialId)}`, { method: "DELETE" });
    replaceProject(project);
    renderMaterials();
    elements.materialDialog.close();
  });
  if (result.ok) showToast("החומר נמחק מהפרויקט");
});

elements.systemDialog.addEventListener("click", async (event) => {
  if (event.target.closest("[data-retry-system]")) return await loadSystemCenter();
  const restoreBackupButton = event.target.closest("[data-restore-backup]");
  if (restoreBackupButton) {
    const confirmed = await requestConfirmation({ title: "שחזור גיבוי", message: "כל הפרויקטים הפעילים יוחלפו בתוכן הגיבוי. לפני השחזור ייווצר אוטומטית גיבוי ביטחון של המצב הנוכחי.", confirmLabel: "שחזור הגיבוי" });
    if (!confirmed) return;
    const result = await runAction(restoreBackupButton, "משחזר...", async () => {
      await requestJson(`/local/backups/${encodeURIComponent(restoreBackupButton.dataset.restoreBackup)}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      await reloadProjects();
      renderAll();
      await loadSystemCenter();
    });
    if (result.ok) showToast("הגיבוי שוחזר. המצב הקודם נשמר בגיבוי ביטחון.", "success", 5000);
    return;
  }
  const restoreArchivedButton = event.target.closest("[data-restore-archived]");
  if (restoreArchivedButton) {
    const result = await runAction(restoreArchivedButton, "מחזיר...", async () => {
      const { project } = await requestJson(`/local/archived-projects/${encodeURIComponent(restoreArchivedButton.dataset.restoreArchived)}/restore`, { method: "POST" });
      replaceProject(project);
      activeProjectId = project.id;
      renderAll();
      await loadSystemCenter();
    });
    if (result.ok) showToast("הפרויקט הוחזר מהארכיון");
  }
});

elements.documentStage.addEventListener("input", (event) => {
  const target = event.target;
  const doc = getActiveProject().document;
  if (target.dataset.docField) doc[target.dataset.docField] = target.textContent.replace(/^הנדון:\s*/, "").trim();
  if (target.dataset.docArray) doc[target.dataset.docArray][Number(target.dataset.index)] = target.textContent.trim();
  if (target.dataset.table) doc[target.dataset.table][Number(target.dataset.index)][target.dataset.key] = target.textContent.trim();
  if (target.dataset.boqKey) {
    const row = doc.boqRows[Number(target.dataset.boqIndex)];
    row[target.dataset.boqKey] = ["quantity", "unitPrice"].includes(target.dataset.boqKey) ? Number(target.value) || 0 : target.value;
    markChanged();
    scheduleA4LayoutCheck();
    return;
  }
  markChanged();
  scheduleA4LayoutCheck();
});

elements.documentStage.addEventListener("change", (event) => {
  if (event.target.dataset.boqKey) {
    renderDocument();
  }
});

elements.documentStage.addEventListener("click", (event) => {
  const evidenceJump = event.target.closest("[data-evidence-jump]");
  if (evidenceJump) {
    const noteId = evidenceJump.dataset.evidenceJump;
    const target = elements.documentStage.querySelector(`[data-evidence-note="${CSS.escape(noteId)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => openEvidenceDialog(noteId), 240);
    return;
  }
  const evidenceButton = event.target.closest("[data-evidence-note]");
  if (evidenceButton) {
    openEvidenceDialog(evidenceButton.dataset.evidenceNote);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-boq]");
  if (deleteButton) {
    const doc = getActiveProject().document;
    const [removed] = doc.boqRows.splice(Number(deleteButton.dataset.deleteBoq), 1);
    if (removed?.id) doc.evidenceNotes = (doc.evidenceNotes || []).filter((note) => note.anchorId !== removed.id);
    markChanged();
    renderDocument();
    return;
  }
  if (event.target.closest("#add-boq-row")) {
    getActiveProject().document.boqRows.push({ id: crypto.randomUUID(), code: "", description: "עבודה חדשה", unit: "יח׳", quantity: 1, unitPrice: 0, category: "עבודות כלליות" });
    markChanged();
    renderDocument();
  }
});

elements.evidenceDiscussButton.addEventListener("click", () => {
  const context = buildEvidenceChatContext(selectedEvidenceNoteId);
  if (!context) return;
  elements.chatInput.value = context;
  elements.evidenceDialog.close();
  if (window.matchMedia("(max-width: 900px)").matches) document.querySelector('.mobile-nav [data-mobile-view="chat"]').click();
  elements.chatInput.focus();
  elements.chatInput.setSelectionRange(context.length, context.length);
  showToast("ההקשר הועתק לצ׳אט. אפשר להוסיף שאלה ולשלוח.");
});

elements.evidenceSourceButton.addEventListener("click", () => {
  const context = evidenceContext(selectedEvidenceNoteId);
  if (!context?.note.source) return;
  const material = findEvidenceMaterial(context.note);
  if (!material) {
    showToast(`המקור הרשום הוא ${evidenceSourceLabel(context.note)}, אך הקובץ אינו זמין כרגע בפרויקט.`, "error", 5000);
    return;
  }
  elements.evidenceDialog.close();
  openMaterialDialog(material.id, context.note.source);
});

elements.dekelLines.addEventListener("click", async (event) => {
  if (event.target.closest("[data-retry-dekel]")) await openDekelReview();
});

elements.dekelLines.addEventListener("change", async (event) => {
  const lineElement = event.target.closest("[data-dekel-line]");
  if (!lineElement) return;
  const body = event.target.matches("[data-dekel-code]")
    ? { selectedCode: event.target.value }
    : event.target.matches("[data-dekel-quantity]")
      ? { quantity: Number(event.target.value) }
      : event.target.matches("[data-dekel-included]")
        ? { included: event.target.checked }
        : null;
  if (!body) return;
  const result = await runAction(event.target, "", async () => await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/dekel/lines/${encodeURIComponent(lineElement.dataset.dekelLine)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  if (!result.ok) return;
  replaceProject(result.value.project);
  renderDekelReview(result.value.review);
});

elements.dekelApplyButton.addEventListener("click", async (event) => {
  const confirmed = await requestConfirmation({
    title: "החלת בחירת DEKEL",
    message: "השורות שנבחרו יעדכנו את כתב הכמויות במחירי יחידה ללא מע״מ. שורות שהוצאו יימחקו מכתב הכמויות. לפני השינוי תישמר גרסה מלאה של המסמך.",
    confirmLabel: "החלה ושמירת גרסה",
    tone: "primary",
  });
  if (!confirmed) return;
  const result = await runAction(event.currentTarget, "מחיל DEKEL...", async () => await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/dekel/apply`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
  }));
  if (!result.ok) return;
  replaceProject(result.value.project);
  renderDocument();
  renderVersions();
  renderDekelReview(result.value.review);
  showToast(`${result.value.appliedRows} שורות DEKEL הוחלו ונשמרה גרסה קודמת`, "success", 5000);
});

elements.versionsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-restore-version]");
  if (!button) return;
  const confirmed = await requestConfirmation({ title: "שחזור גרסת מסמך", message: "המסמך הנוכחי יוחלף בגרסה שנבחרה. גרסה נוספת של המצב הנוכחי תישמר אוטומטית.", confirmLabel: "שחזור הגרסה", tone: "primary" });
  if (!confirmed) return;
  const result = await runAction(button, "משחזר...", async () => {
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/versions/${encodeURIComponent(button.dataset.restoreVersion)}/restore`, { method: "POST" });
    replaceProject(project);
    renderDocument();
    elements.versionsDialog.close();
  });
  if (result.ok) showToast("הגרסה שוחזרה והמצב הקודם נשמר");
});

async function sendProjectChat({ message = "", retryOfMessageId = "" }) {
  if (chatSending) return;
  if (!codexConnected) {
    elements.codexDialog.showModal();
    return;
  }
  if (!message && !retryOfMessageId) return;
  if (message) addChatMessage("user", message);
  if (retryOfMessageId) getActiveProject().chat = getActiveProject().chat.filter((item) => !(item.role === "assistant" && item.status === "failed" && item.retryOfMessageId === retryOfMessageId));
  const pendingId = crypto.randomUUID();
  getActiveProject().chat.push({ id: pendingId, role: "assistant", text: retryOfMessageId ? "קורא שוב את ההקשר המלא של הפרויקט..." : "קורא את חומרי הפרויקט וחושב...", createdAt: new Date().toISOString(), status: "pending" });
  renderChat();
  chatSending = true;
  const sendButton = elements.chatForm.querySelector("button[type=submit]");
  syncChatAvailability();
  sendButton.setAttribute("aria-busy", "true");
  try {
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(retryOfMessageId ? { retryOfMessageId } : { message }),
    });
    replaceProject(project);
    renderAll();
  } catch (error) {
    try {
      const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}`);
      replaceProject(project);
      renderChat();
    } catch {
      getActiveProject().chat = getActiveProject().chat.filter((item) => item.id !== pendingId);
      renderChat();
    }
    showToast(error.message, "error", 6000);
  } finally {
    chatSending = false;
    sendButton.removeAttribute("aria-busy");
    syncChatAvailability();
    elements.chatInput.focus();
  }
}

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (!message) return;
  elements.chatInput.value = "";
  await sendProjectChat({ message });
});

elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

elements.chatMessages.addEventListener("click", async (event) => {
  const retry = event.target.closest("[data-retry-chat]");
  if (retry) {
    await sendProjectChat({ retryOfMessageId: retry.dataset.retryChat });
    return;
  }
  const apply = event.target.closest("[data-apply-proposal]");
  const reject = event.target.closest("[data-reject-proposal]");
  const id = apply?.dataset.applyProposal || reject?.dataset.rejectProposal;
  if (!id) return;
  if (apply) {
    const confirmed = await requestConfirmation({ title: "אישור הצעת הצ׳אט", message: "השינוי יחול רק בפרויקט הנוכחי. לפני שינוי במסמך תישמר גרסה מלאה, ולא ניתן לשנות מכאן כללים כלליים של המערכת.", confirmLabel: "אישור והחלה", tone: "primary" });
    if (!confirmed) return;
  }
  const action = reject ? "reject" : "apply";
  const actionButton = apply || reject;
  const result = await runAction(actionButton, "שומר...", async () => {
    const { project } = await requestJson(`/local/projects/${encodeURIComponent(activeProjectId)}/proposals/${encodeURIComponent(id)}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "project" }),
    });
    replaceProject(project);
    renderAll();
  });
  if (result.ok) showToast(reject ? "ההצעה נדחתה" : "ההצעה אושרה והוחלה");
});

async function initialize() {
  try {
    await reloadProjects();
    renderAll();
    resumeProjectProcessing(getActiveProject());
    elements.saveIndicator.textContent = "כל הנתונים נטענו ונשמרים מקומית";
    elements.saveIndicator.className = "save-indicator";
    await refreshCodexStatus();
  } catch (error) {
    renderFatalError(error);
  }
}

async function reloadProjects() {
  const result = await requestJson("/local/projects");
  projects = result.projects;
  for (const project of projects) {
    expandLegacyBoqDescriptions(project.document?.boqRows);
    ensureDocumentEvidence(project.document);
  }
  if (!projects.length) throw new Error("לא נמצא פרויקט פעיל. הפעל מחדש את המערכת כדי ליצור פרויקט ראשוני.");
  if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = projects[0].id;
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
}

function expandLegacyBoqDescriptions(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const replacement = LEGACY_BOQ_DESCRIPTIONS[row.code];
    if (replacement && row.description === replacement.short) row.description = replacement.full;
  }
}

function ensureDocumentEvidence(doc) {
  if (!doc || !Array.isArray(doc.boqRows)) return;
  const usedIds = new Set();
  for (const row of doc.boqRows) {
    let id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : EXAMPLE_BOQ_IDS[row.code];
    if (!id || usedIds.has(id)) id = crypto.randomUUID();
    row.id = id;
    usedIds.add(id);
  }
  if (!Array.isArray(doc.evidenceNotes)) doc.evidenceNotes = [];
  doc.evidenceNotes = doc.evidenceNotes.filter((note) => note?.id && note.anchorType === "boqRow" && usedIds.has(note.anchorId));
  if (!doc.evidenceNotes.length) {
    const cleanupRow = doc.boqRows.find((row) => row.code === "95.69.04.0003");
    if (cleanupRow) doc.evidenceNotes.push(createDefaultEvidenceNote(cleanupRow.id));
  }
}

function renderFatalError(error) {
  document.body.innerHTML = `<main class="fatal-error" role="alert">
    <div class="brand-mark" aria-hidden="true">M</div>
    <h1>לא הצלחנו לפתוח את MASHMAUET</h1>
    <p>${escapeHtml(error.message)}</p>
    <p class="muted">ודא שהמערכת הופעלה דרך START-MASHMAUET.cmd ונסה שוב.</p>
    <button id="retry-initialize" class="primary-button" type="button">ניסיון נוסף</button>
  </main>`;
  document.querySelector("#retry-initialize").addEventListener("click", () => window.location.reload());
}

async function refreshCodexStatus() {
  try {
    const status = await requestJson("/local/codex/status");
    codexConnected = Boolean(status.connected);
    const unavailable = status.state === "unavailable";
    elements.codexStatus.textContent = codexConnected ? "מחובר" : unavailable ? "לא זמין" : "נדרש קישור";
    elements.codexStatus.className = `status-badge ${codexConnected ? "connected" : unavailable ? "error" : "pending"}`;
    document.querySelector("#connect-codex-button").hidden = codexConnected;
    codexConnectionMessage = codexConnected
      ? "מחובר לחשבון הנוכחי. הצ׳אט קורא רק את הפרויקט הפעיל וכל שינוי דורש אישור."
      : unavailable
        ? "תהליך Codex המקומי אינו זמין כרגע. אפשר לבדוק שוב או להפעיל מחדש את MASHMAUET."
        : "נדרש קישור חד־פעמי לחשבון ChatGPT/Codex הנוכחי — ללא שם משתמש או סיסמה בתוך MASHMAUET.";
    document.querySelector("#codex-dialog-status").textContent = codexConnectionMessage;
    document.querySelector("#start-codex-login-button").hidden = codexConnected || unavailable;
  } catch (error) {
    codexConnected = false;
    codexConnectionMessage = "לא ניתן לבדוק את Codex. השרת המקומי ממשיך לשמור את הפרויקט ואפשר לנסות שוב.";
    elements.codexStatus.textContent = "לא זמין";
    elements.codexStatus.className = "status-badge error";
    document.querySelector("#connect-codex-button").hidden = false;
  }
  syncChatAvailability();
}

function syncChatAvailability() {
  const sendButton = elements.chatForm.querySelector("button[type=submit]");
  elements.chatInput.disabled = !codexConnected || chatSending;
  sendButton.disabled = !codexConnected || chatSending;
  elements.chatStateMessage.textContent = chatSending ? "Codex קורא את חומרי הפרויקט, המסמך והשיחה..." : codexConnectionMessage;
  elements.chatStateMessage.className = `chat-state-message ${codexConnected ? "ready" : "blocked"}`;
}

async function connectCodex() {
  try {
    const result = await requestJson("/local/codex/login", { method: "POST" });
    const authUrl = result.authUrl || result.auth_url;
    if (authUrl) window.open(authUrl, "_blank", "noopener");
    document.querySelector("#codex-dialog-status").textContent = "לאחר השלמת הקישור בדפדפן, חזור לכאן. הסטטוס יתעדכן אוטומטית.";
    const timer = window.setInterval(async () => {
      await refreshCodexStatus();
      if (elements.codexStatus.classList.contains("connected")) { window.clearInterval(timer); elements.codexDialog.close(); }
    }, 2500);
    window.setTimeout(() => window.clearInterval(timer), 180000);
  } catch (error) { showToast(error.message, "error", 5000); }
}

function replaceProject(project) {
  expandLegacyBoqDescriptions(project.document?.boqRows);
  ensureDocumentEvidence(project.document);
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
  if (project.id === activeProjectId) syncProjectReadiness(project);
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("לא ניתן להגיע לשרת המקומי. ודא ש־MASHMAUET עדיין פועל ונסה שוב.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const knownMessages = {
      validation_error: "חלק מהנתונים אינם תקינים. בדוק את השדות ונסה שוב.",
      file_too_large: "הקובץ גדול מ־100 MB ולא ניתן להוסיף אותו.",
      unsupported_file_type: "סוג הקובץ אינו נתמך. אפשר להוסיף PDF, XLSX, DOCX, טקסט, תמונה או וידאו.",
      file_signature_mismatch: "תוכן הקובץ אינו תואם לסיומת שלו. שמור אותו מחדש ונסה שוב.",
      codex_unavailable: "Codex לא ענה כרגע. ההודעה נשמרה ואפשר לנסות שוב.",
      last_project: "לא ניתן להעביר לארכיון את הפרויקט הפעיל היחיד.",
      invalid_backup: "הגיבוי פגום או ריק ולכן לא בוצע שחזור.",
      rate_limit: "בוצעו פעולות רבות בזמן קצר. המתן מעט ונסה שוב.",
      request_too_large: "הבקשה גדולה מדי ולא נשמרה.",
      material_analysis_failed: "Codex לא הצליח לפענח את החומר. הקובץ המקורי וכל תוכן שכבר נקרא נשמרו.",
      material_not_ready_for_analysis: "החומר עדיין אינו מוכן לניתוח. בווידאו יש להמתין להכנת הפריימים.",
      invalid_dekel_selection: "הקוד שהוזן אינו קיים במחירון DEKEL הגלובלי הקבוע.",
      stale_dekel_review: "כתב הכמויות השתנה מאז בדיקת DEKEL. יש להריץ התאמה מחדש לפני ההחלה.",
      dekel_review_incomplete: "לא לכל השורות הכלולות נבחר קוד DEKEL עם יחידת מידה תואמת.",
      empty_dekel_selection: "לא נבחרו שורות DEKEL להחלה.",
      financial_audit_failed: "הביקורת הכספית לא עברה ולכן ההחלה נחסמה.",
    };
    const error = new Error(knownMessages[body.code] || body.error || `הפעולה נכשלה (HTTP ${response.status})`);
    error.code = body.code;
    error.requestId = body.requestId;
    throw error;
  }
  return body;
}

initialize();

// Keep the agreed financial rule visible in runtime diagnostics.
console.info(`MASHMAUET local UI ready. VAT: ${VAT_RATE * 100}%`);
