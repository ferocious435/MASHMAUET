import { access, copyFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { LocalBackupManifest, LocalProject } from "./local-project-types.ts";
import { documentSchema } from "./local-workspace-validation.ts";
import { LocalWorkspaceError } from "./local-workspace-error.ts";

const DEFAULT_DOCUMENT = {
  subject: "מסמך משמעויות לפרויקט שיפוץ והתאמת מבנה",
  background: "בהמשך לסיור ולבחינת הצורך המבצעי, נדרש לבצע עבודות שיפוץ והתאמה במבנה הקיים, בהתאם לתכולה המפורטת במסמך זה ובכתב הכמויות המצורף.",
  objective: "הצגת משמעויות ראשוניות לפרויקט, לרבות תכולת העבודה, אומדן תקציבי, לוח זמנים עקרוני וניהול סיכונים, לצורך קבלת החלטה והמשך תכנון וביצוע.",
  scope: ["עבודות הכנה, פירוק ופינוי בהתאם לצורך.", "עבודות איטום, תיקונים וגמר במעטפת ובחללים הפנימיים.", "התאמות חשמל, תאורה ומיזוג אוויר.", "בדיקות, ניקיון ומסירת המבנה לאחר השלמת העבודות."],
  estimateNotes: ["האומדן מבוסס על כתב הכמויות המפורט ועל מחירי היחידה שנבחרו.", "המחירים בפירוט האומדן כוללים מע״מ בשיעור 18%.", "דמי תכנון, תפעול וניהול ופיקוח מחושבים מהסכום הכולל מע״מ."],
  scheduleRows: [
    { stage: "תכנון, תיאום ואישור", duration: "3–4 שבועות", notes: "לאחר אישור הפרויקט" },
    { stage: "היערכות והזמנת חומרים", duration: "2–3 שבועות", notes: "במקביל להשלמת התכנון" },
    { stage: "ביצוע העבודות", duration: "8–10 שבועות", notes: "בהתאם לזמינות האתר" },
    { stage: "בדיקות ומסירה", duration: "שבוע", notes: "לאחר השלמת כלל העבודות" },
  ],
  scheduleNotes: "לוח הזמנים הינו עקרוני ויעודכן לאחר השלמת התכנון, אישור כתב הכמויות ותיאום מועד תחילת הביצוע.",
  riskRows: [
    { risk: "אי־התאמות בין התכנון למצב הקיים", response: "מדידה וסיור משותף לפני ביצוע", owner: "תכנון וביצוע" },
    { risk: "עיכוב באספקת חומרים", response: "הזמנה מוקדמת ואישור חלופות", owner: "ניהול הפרויקט" },
    { risk: "עבודות נוספות שיתגלו במהלך הביצוע", response: "עצירה, תיעוד ואישור לפני ביצוע", owner: "פיקוח" },
  ],
  additionalNotes: "אין לבצע שינוי בתכולה או חריגה מכתב הכמויות ללא תיעוד ואישור הגורם המוסמך.",
  boqRows: [
    { id: "boq-example-95-05-10-0045", code: "95.05.10.0045", description: "איטום גגות קלים ביריעות P.V.C (היריעה חסינת אש לפי ת\"י 755), מחוזקת בממברנה מפוליאסטר, בשיטת הקיבוע המכני (הנחה חצי חופשית) לרבות קיבוע מכני של פלטות פוליסטירן מוקצף 30-F בעובי 4 ס\"מ לתשתית הגג ע\"י ברגי דיסקית מצופים P.V.C, יריעות P.V.C לבנות בעובי 1.2 מ\"מ משורינות ברשת פוליאסטר מולחמות לדיסקיות הקיבוע והלחמת חפיפות ברוחב 10 ס\"מ, איטום פרטים שונים כגון: פתחי ניקוז, צנרת ואביזרים, סגירת יריעות האיטום בקצה הגג ע\"י פרופיל זווית מ-P.V.C במידות 4/4 ס\"מ או 6/6 ס\"מ. תקופת אחריות של 20 שנים", unit: "מטר", quantity: 147.1, unitPrice: 211, category: "עבודות איטום" },
    { id: "boq-example-95-10-20-0034", code: "95.10.20.0034", description: "ריצוף באריחי גומי בעובי 2.6 מ\"מ ובמידות 50/50 ס\"מ, 100/100 ס\"מ, על משטח מיושר וקשיח הנמדד בנפרד", unit: "מ״ר", quantity: 25, unitPrice: 496, category: "עבודות גמר" },
    { id: "boq-example-95-22-20-0049", code: "95.22.20.0049", description: "תקרת מגשי פח מגולוון מכופפים בכל צדדיו וצבוע בצבע אפור או לבן: מגשים עם חירור מיקרו שוליים רחבים, ברוחב 50, 40, 30 ס\"מ ובעובי 0.6 מ\"מ, כדוגמת \"Innovate\" או ש\"ע עם בידוד אקוסטי בגב המגש. המחיר כולל את הפרופילים הנושאים, אלמנטי התליה (בגובה עד 1.0 מ') ופרופילי הגמר (L+Z) בעובי 1.2 מ\"מ ליד הקירות. (מחיר יסוד למגשי פח 150 ש''ח/מ''ר)", unit: "מטר", quantity: 143, unitPrice: 348, category: "עבודות גמר" },
    { id: "boq-example-95-08-42-0210", code: "95.08.42.0210", description: "גוף תאורה לינארי צמוד תקרה 6400LM IP65 באורך 1500mm", unit: "יח׳", quantity: 12, unitPrice: 347, category: "עבודות חשמל ותאורה" },
    { id: "boq-example-95-08-50-0140", code: "95.08.50.0140", description: "נקודת מאור במעגל חד פאזי לרבות צינורות בהתקנה גלויה או חשיפה, כבלי נחושת N2XY/FR בחתך 3X1.5 ממ\"ר מהלוח עד היציאה מהתקרה או הקיר ועד המפסקים, מפסק/י זרם יחיד או כפול או דו קוטבי או חילוף או צלב או לחצנים או מוגן מים או משוריין, ומוליך נוסף עבור נקודה לתאורת חירום, אם נדרש, לרבות וו תליה", unit: "יח׳", quantity: 12, unitPrice: 221, category: "עבודות חשמל ותאורה" },
    { id: "boq-example-95-07-10-0235", code: "95.07.10.0235", description: "נקודה לניקוז מזגן מפוצל או מיני מרכזי או מערכת VRF, לרבות צינור פוליפרופילן בקוטר 32-40 מ\"מ ובאורך עד 4.0 מ' וחיבור למחסום רצפה קיים", unit: "קומפ׳", quantity: 3, unitPrice: 920, category: "מיזוג ותשתיות" },
    { id: "boq-example-95-69-04-0003", code: "95.69.04.0003", description: "נקיון יסודי חד פעמי של מבנים הכוללים שטחים ציבוריים לאחר שיפוץ ולפני איכלוס. שטחים ציבוריים כוללים: חצרות, חדרי מדרגות, חניונים, חדרי שרות, חלונות פנים וחוץ - קומפלט לרבות פנים המשרדים. (השטחים הציבוריים נכללים אך לא נמדדים)", unit: "מטר", quantity: 143, unitPrice: 23.5, category: "עבודות משלימות" },
  ],
  evidenceNotes: [{
    id: "evidence-example-final-cleaning",
    anchorType: "boqRow",
    anchorId: "boq-example-95-69-04-0003",
    kind: "inference",
    title: "עבודה משלימה שנכללה על ידי המערכת",
    explanation: "המערכת כללה ניקיון יסודי לאחר השלמת עבודות השיפוץ.",
    reason: "ניקיון ומסירה הם שלב נדרש להשלמת פרויקט שיפוץ גם כאשר העבודה אינה מפורטת בתיאור הראשוני.",
    confidence: "high",
  }],
};

export class LocalProjectStore {
  readonly rootPath: string;
  constructor(rootPath: string) { this.rootPath = rootPath; }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.projectsPath(), { recursive: true }),
      mkdir(this.archivePath(), { recursive: true }),
      mkdir(this.backupsPath(), { recursive: true }),
    ]);
    await this.recoverTemporaryFiles();
    if ((await this.list()).length === 0) await this.create("שיפוץ מבנה — פרויקט לדוגמה", "שיפוץ והתאמת מבנה קיים לצרכים תפעוליים, כולל עבודות איטום, גמר, חשמל ומיזוג.");
    await this.ensureDailyBackup();
  }

  async list(): Promise<LocalProject[]> {
    await mkdir(this.projectsPath(), { recursive: true });
    const entries = await readdir(this.projectsPath(), { withFileTypes: true });
    const projects = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return await this.get(entry.name); } catch { return undefined; }
    }));
    return projects.filter((project): project is LocalProject => Boolean(project)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(name: string, description: string): Promise<LocalProject> {
    const now = new Date().toISOString();
    const project: LocalProject = {
      schemaVersion: 1, revision: 0,
      id: randomUUID(), name, description, createdAt: now, updatedAt: now,
      materials: [], versions: [], proposals: [], rules: [],
      chat: [{ id: randomUUID(), role: "assistant", text: "הפרויקט נפתח. החומרים, המסמך והשיחה נשמרים בנפרד מכל פרויקט אחר.", createdAt: now }],
      document: structuredClone(DEFAULT_DOCUMENT),
    };
    project.document.subject = `מסמך משמעויות לפרויקט ${name}`;
    project.document.background = description;
    await mkdir(this.materialsPath(project.id), { recursive: true });
    await mkdir(this.derivedPath(project.id), { recursive: true });
    await this.save(project);
    return project;
  }

  async get(id: string): Promise<LocalProject> {
    this.assertId(id);
    const raw = JSON.parse(await readFile(this.projectJsonPath(id), "utf8")) as Partial<LocalProject>;
    const project = migrateProject(raw);
    await this.repairMaterialPaths(project);
    return project;
  }

  async save(project: LocalProject): Promise<void> {
    this.assertId(project.id);
    ensureDocumentEvidence(project.document);
    const parsedDocument = documentSchema.safeParse(project.document);
    if (!parsedDocument.success) throw new LocalWorkspaceError(400, "invalid_document", `Документ не прошёл проверку: ${parsedDocument.error.issues[0]?.message ?? "ошибка"}`);
    project.schemaVersion = 1;
    project.revision = Number.isInteger(project.revision) ? project.revision + 1 : 1;
    project.updatedAt = new Date().toISOString();
    if (project.versions.length > 100) project.versions = project.versions.slice(-100);
    const directory = this.projectPath(project.id);
    await mkdir(directory, { recursive: true });
    await this.writeJsonAtomic(this.projectJsonPath(project.id), project);
  }

  projectPath(id: string): string { this.assertId(id); return join(this.projectsPath(), id); }
  materialsPath(id: string): string { return join(this.projectPath(id), "materials"); }
  derivedPath(id: string): string { return join(this.projectPath(id), "derived"); }
  materialPath(projectId: string, materialId: string, originalName: string): string {
    this.assertId(materialId);
    const safeName = basename(originalName).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 180) || "material";
    return this.assertInside(this.projectPath(projectId), join(this.materialsPath(projectId), `${materialId}-${safeName}`));
  }
  projectJsonPath(id: string): string { return join(this.projectPath(id), "project.json"); }
  async removeMaterialFiles(projectId: string, materialId: string): Promise<void> {
    const project = await this.get(projectId);
    const material = project.materials.find((item) => item.id === materialId);
    if (!material) return;
    const directory = this.materialsPath(projectId);
    const entries = await readdir(directory);
    for (const entry of entries.filter((name) => name.startsWith(`${materialId}-`))) await rm(join(directory, entry), { force: true });
    await rm(join(this.derivedPath(projectId), materialId), { recursive: true, force: true });
  }
  async readGlobalRules(): Promise<string[]> {
    try {
      const value = JSON.parse(await readFile(join(this.rootPath, "global-rules.json"), "utf8"));
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 1_000) : [];
    } catch { return []; }
  }
  async saveGlobalRules(rules: string[]): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
    await this.writeJsonAtomic(join(this.rootPath, "global-rules.json"), [...new Set(rules.map((rule) => rule.trim()).filter(Boolean))].slice(0, 1_000));
  }
  async listArchived(): Promise<LocalProject[]> {
    await mkdir(this.archivePath(), { recursive: true });
    const entries = await readdir(this.archivePath(), { withFileTypes: true });
    const projects: LocalProject[] = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        const raw = JSON.parse(await readFile(join(this.archivePath(), entry.name, "project.json"), "utf8")) as Partial<LocalProject>;
        projects.push(migrateProject(raw));
      } catch { /* surfaced by health diagnostics */ }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async archiveProject(id: string): Promise<void> {
    this.assertId(id);
    if ((await this.list()).length <= 1) throw new LocalWorkspaceError(409, "last_project", "Нельзя архивировать единственный активный проект");
    await this.createBackup(`Перед архивированием ${id}`, "safety");
    await rename(this.projectPath(id), join(this.archivePath(), id));
  }
  async restoreArchivedProject(id: string): Promise<LocalProject> {
    this.assertId(id);
    const destination = this.projectPath(id);
    if (await exists(destination)) throw new LocalWorkspaceError(409, "project_exists", "Проект с таким идентификатором уже активен");
    await rename(join(this.archivePath(), id), destination);
    return await this.get(id);
  }
  async listBackups(): Promise<LocalBackupManifest[]> {
    await mkdir(this.backupsPath(), { recursive: true });
    const entries = await readdir(this.backupsPath(), { withFileTypes: true });
    const manifests: LocalBackupManifest[] = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try { manifests.push(JSON.parse(await readFile(join(this.backupsPath(), entry.name, "manifest.json"), "utf8")) as LocalBackupManifest); }
      catch { /* surfaced by health diagnostics */ }
    }
    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createBackup(label = "Резервная копия", kind: LocalBackupManifest["kind"] = "manual"): Promise<LocalBackupManifest> {
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const destination = join(this.backupsPath(), id);
    await mkdir(destination, { recursive: true });
    await cp(this.projectsPath(), join(destination, "projects"), { recursive: true, errorOnExist: true });
    const globalRulesPath = join(this.rootPath, "global-rules.json");
    if (await exists(globalRulesPath)) await copyFile(globalRulesPath, join(destination, "global-rules.json"));
    const manifest: LocalBackupManifest = { id, label, kind, createdAt, projectCount: (await this.list()).length };
    await this.writeJsonAtomic(join(destination, "manifest.json"), manifest);
    return manifest;
  }
  async restoreBackup(id: string): Promise<{ restored: LocalBackupManifest; safetyBackup: LocalBackupManifest }> {
    this.assertBackupId(id);
    const backupPath = join(this.backupsPath(), id);
    const manifest = JSON.parse(await readFile(join(backupPath, "manifest.json"), "utf8")) as LocalBackupManifest;
    const safetyBackup = await this.createBackup(`Перед восстановлением ${id}`, "safety");
    const stagingPath = join(this.rootPath, `.restore-${randomUUID()}`);
    const oldProjectsPath = join(this.rootPath, `.projects-old-${randomUUID()}`);
    await cp(join(backupPath, "projects"), join(stagingPath, "projects"), { recursive: true, errorOnExist: true });
    await validateProjectsDirectory(join(stagingPath, "projects"));
    try {
      await rename(this.projectsPath(), oldProjectsPath);
      await rename(join(stagingPath, "projects"), this.projectsPath());
      const backupRules = join(backupPath, "global-rules.json");
      if (await exists(backupRules)) await copyFile(backupRules, join(this.rootPath, "global-rules.json"));
      else await rm(join(this.rootPath, "global-rules.json"), { force: true });
      await rm(oldProjectsPath, { recursive: true, force: true });
    } catch (error) {
      if (!(await exists(this.projectsPath())) && await exists(oldProjectsPath)) await rename(oldProjectsPath, this.projectsPath());
      throw error;
    } finally {
      await rm(stagingPath, { recursive: true, force: true });
    }
    return { restored: manifest, safetyBackup };
  }
  async health(): Promise<{ writable: boolean; activeProjects: number; archivedProjects: number; backups: number; corruptEntries: string[] }> {
    const probePath = join(this.rootPath, `.health-${randomUUID()}.tmp`);
    let writable = false;
    try { await mkdir(this.rootPath, { recursive: true }); await writeFile(probePath, "ok", "utf8"); writable = true; }
    finally { await rm(probePath, { force: true }); }
    const corruptEntries = await this.findCorruptEntries();
    return { writable, activeProjects: (await this.list()).length, archivedProjects: (await this.listArchived()).length, backups: (await this.listBackups()).length, corruptEntries };
  }
  private projectsPath(): string { return join(resolve(this.rootPath), "projects"); }
  private archivePath(): string { return join(resolve(this.rootPath), "archive"); }
  private backupsPath(): string { return join(resolve(this.rootPath), "backups"); }
  private assertId(id: string): void { if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Некорректный идентификатор"); }
  private assertInside(root: string, candidate: string): string {
    const resolvedRoot = `${resolve(root)}${sep}`;
    const resolvedCandidate = resolve(candidate);
    if (!`${resolvedCandidate}${sep}`.startsWith(resolvedRoot)) throw new Error("Путь выходит за пределы проекта");
    return resolvedCandidate;
  }
  private assertBackupId(id: string): void { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new LocalWorkspaceError(400, "invalid_backup_id", "Некорректный идентификатор резервной копии"); }
  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await rename(temporaryPath, path);
  }
  private async repairMaterialPaths(project: LocalProject): Promise<void> {
    const entries = await readdir(this.materialsPath(project.id)).catch(() => [] as string[]);
    for (const material of project.materials) {
      const sourceName = entries.find((name) => name.startsWith(`${material.id}-`));
      if (sourceName) material.sourcePath = join(this.materialsPath(project.id), sourceName);
      const derivedDirectory = join(this.derivedPath(project.id), material.id);
      const textPath = join(derivedDirectory, "content.txt");
      material.extractedTextPath = await exists(textPath) ? textPath : undefined;
      const derivedEntries = await readdir(derivedDirectory).catch(() => [] as string[]);
      const renderedPages = derivedEntries.filter((name) => /^page-\d+\.png$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0])).map((name) => join(derivedDirectory, name));
      if (/^image\//i.test(material.type) && material.sourcePath) material.visionImagePaths = [material.sourcePath];
      else material.visionImagePaths = renderedPages;
    }
  }
  private async ensureDailyBackup(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if ((await this.listBackups()).some((backup) => backup.kind === "automatic" && backup.createdAt.startsWith(today))) return;
    await this.createBackup(`Автоматическая копия ${today}`, "automatic");
  }
  private async recoverTemporaryFiles(): Promise<void> {
    for (const projectEntry of await readdir(this.projectsPath(), { withFileTypes: true })) {
      if (!projectEntry.isDirectory()) continue;
      const directory = join(this.projectsPath(), projectEntry.name);
      for (const entry of await readdir(directory)) if (entry.endsWith(".tmp")) await rm(join(directory, entry), { force: true });
    }
  }
  private async findCorruptEntries(): Promise<string[]> {
    const corrupt: string[] = [];
    for (const base of [this.projectsPath(), this.archivePath()]) {
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try { migrateProject(JSON.parse(await readFile(join(base, entry.name, "project.json"), "utf8")) as Partial<LocalProject>); }
        catch { corrupt.push(entry.name); }
      }
    }
    return [...new Set(corrupt)];
  }
}

function migrateProject(raw: Partial<LocalProject>): LocalProject {
  if (!raw.id || !/^[a-zA-Z0-9-]{1,80}$/.test(raw.id)) throw new Error("Повреждён идентификатор проекта");
  const document = documentSchema.parse(raw.document);
  ensureDocumentEvidence(document);
  return {
    schemaVersion: 1,
    revision: Number.isInteger(raw.revision) ? Number(raw.revision) : 0,
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "Без названия",
    description: typeof raw.description === "string" ? raw.description : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    materials: Array.isArray(raw.materials) ? raw.materials : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    chat: Array.isArray(raw.chat) ? raw.chat : [],
    proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
    rules: Array.isArray(raw.rules) ? raw.rules.filter((item): item is string => typeof item === "string") : [],
    codexThreadId: typeof raw.codexThreadId === "string" ? raw.codexThreadId : undefined,
    dekelReview: isLocalDekelReview(raw.dekelReview) ? raw.dekelReview : undefined,
    document,
  };
}

function isLocalDekelReview(value: unknown): value is NonNullable<LocalProject["dekelReview"]> {
  if (!value || typeof value !== "object") return false;
  const review = value as Record<string, unknown>;
  return typeof review.id === "string"
    && (review.status === "ready" || review.status === "applied")
    && typeof review.analyzedAt === "string"
    && typeof review.workbookFileName === "string"
    && Array.isArray(review.lines)
    && Array.isArray(review.warnings);
}

function ensureDocumentEvidence(document: Record<string, unknown>): void {
  const rows = Array.isArray(document.boqRows) ? document.boqRows as Array<Record<string, unknown>> : [];
  const usedIds = new Set<string>();
  for (const row of rows) {
    const existing = typeof row.id === "string" && row.id.trim() && !usedIds.has(row.id) ? row.id : undefined;
    const knownId = typeof row.code === "string" ? `boq-example-${row.code.replaceAll(".", "-")}` : undefined;
    row.id = existing ?? (knownId && !usedIds.has(knownId) ? knownId : `boq-${randomUUID()}`);
    usedIds.add(String(row.id));
  }
  if (!Array.isArray(document.evidenceNotes)) document.evidenceNotes = [];
  const notes = document.evidenceNotes as Array<Record<string, unknown>>;
  if (notes.length === 0) {
    const cleanup = rows.find((row) => row.code === "95.69.04.0003");
    if (cleanup?.id) notes.push({
      id: "evidence-example-final-cleaning",
      anchorType: "boqRow",
      anchorId: cleanup.id,
      kind: "inference",
      title: "עבודה משלימה שנכללה על ידי המערכת",
      explanation: "המערכת כללה ניקיון יסודי לאחר השלמת עבודות השיפוץ.",
      reason: "ניקיון ומסירה הם שלב נדרש להשלמת פרויקט שיפוץ גם כאשר העבודה אינה מפורטת בתיאור הראשוני.",
      confidence: "high",
    });
  }
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function validateProjectsDirectory(projectsPath: string): Promise<void> {
  try {
    const entries = await readdir(projectsPath, { withFileTypes: true });
    if (!entries.some((entry) => entry.isDirectory())) throw new Error("empty");
    for (const entry of entries.filter((item) => item.isDirectory())) {
      migrateProject(JSON.parse(await readFile(join(projectsPath, entry.name, "project.json"), "utf8")) as Partial<LocalProject>);
    }
  } catch { throw new LocalWorkspaceError(400, "invalid_backup", "Резервная копия повреждена или пуста"); }
}
