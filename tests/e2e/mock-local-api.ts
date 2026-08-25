import { expect, type Page, type Route } from "@playwright/test";

type TerminalStatus = "ready" | "needs_review" | "failed";

type MockProject = Record<string, any> & {
  id: string;
  name: string;
  description: string;
  materials: Array<Record<string, any>>;
  processing: Record<string, any>;
  document: Record<string, any>;
};

const now = () => new Date().toISOString();

function processing(status = "idle", stage = "awaiting_materials", progressPercent = 0, readyForExport = false) {
  return {
    runId: status === "idle" ? null : `run-${Date.now()}`,
    status,
    stage,
    readyForExport,
    progressPercent,
    sourceFingerprint: null,
    validatedDocumentFingerprint: readyForExport ? "fixture-document" : null,
    warningCodes: status === "needs_review" ? ["audio_transcription_needs_review"] : [],
    error: status === "failed" ? { code: "fixture_failure", message: "בדיקת העיבוד נכשלה באופן מבוקר" } : null,
    updatedAt: now(),
  };
}

function blankDocument(name: string) {
  return {
    subject: `מסמך משמעויות לפרויקט ${name}`,
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

function readyDocument(name: string) {
  return {
    subject: `מסמך משמעויות לפרויקט ${name}`,
    background: "המסמך נבנה מחומרי הבדיקה שנקראו והוצלבו.",
    objective: "הצגת תכולה, כמויות ואומדן מאומתים לבדיקת בעל הפרויקט.",
    scope: ["עבודות הכנה ופירוק", "עבודות גמר", "בדיקות, ניקיון ומסירה"],
    estimateNotes: ["המחירים בפירוט האומדן כוללים מע״מ בשיעור 18%."],
    scheduleRows: [{ stage: "ביצוע", duration: "2 שבועות", notes: "לפי חומרי הפרויקט" }],
    scheduleNotes: "לוח הזמנים כפוף לאישור התכולה.",
    riskRows: [{ risk: "פער בין חומר למצב קיים", response: "בדיקה לפני ביצוע", owner: "פיקוח" }],
    additionalNotes: "כל קביעה ניתנת לבדיקה מול חומר המקור.",
    boqRows: [{ id: "fixture-boq-1", code: "95.10.20.0034", description: "ריצוף מלא לרבות הכנת התשתית לפי חומרי הפרויקט", unit: "מ״ר", quantity: 12, unitPrice: 250, category: "עבודות גמר" }],
    evidenceNotes: [{ id: "fixture-evidence-1", anchorType: "boqRow", anchorId: "fixture-boq-1", kind: "source", title: "מדידה מחומר הפרויקט", explanation: "הכמות נלקחה מחומר הבדיקה.", reason: "המדידה מופיעה במקור.", confidence: "high" }],
  };
}

function project(id: string, name: string, description: string): MockProject {
  const timestamp = now();
  return {
    id,
    name,
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    materials: [],
    versions: [],
    chat: [],
    processing: processing(),
    document: blankDocument(name),
  };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export async function installMockLocalApi(page: Page) {
  const projects: MockProject[] = [project("fixture-home", "פרויקט פתיחה", "פרויקט מקומי ריק לבדיקת הדפדפן")];
  const terminalByName = new Map<string, TerminalStatus>();
  const pollsBeforeTerminal = new Map<string, number>();
  const releasedProjects = new Set<string>();
  const runCounts = new Map<string, number>();
  let sequence = 0;

  await page.route("**/local/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = decodeURIComponent(url.pathname);
    const method = request.method();

    if (pathname === "/local/codex/status") return await fulfill(route, { connected: false, state: "disconnected" });
    if (pathname === "/local/health") return await fulfill(route, { ok: true });
    if (pathname === "/local/projects" && method === "GET") return await fulfill(route, { projects });
    if (pathname === "/local/projects" && method === "POST") {
      const input = request.postDataJSON() as { name: string; description: string };
      const created = project(`fixture-${++sequence}`, input.name, input.description);
      projects.unshift(created);
      return await fulfill(route, { project: created }, 201);
    }

    const match = pathname.match(/^\/local\/projects\/([^/]+)(.*)$/);
    if (!match) return await fulfill(route, { code: "fixture_route_missing", message: `${method} ${pathname}` }, 404);
    const [, projectId, suffix] = match;
    const current = projects.find((candidate) => candidate.id === projectId);
    if (!current) return await fulfill(route, { code: "project_not_found" }, 404);

    if (suffix === "" && method === "GET") return await fulfill(route, { project: current });
    if (suffix === "" && method === "PUT") {
      const input = request.postDataJSON() as { name: string; description: string; document: Record<string, any> };
      Object.assign(current, input, { updatedAt: now(), revision: current.revision + 1 });
      current.processing = processing("stale", "awaiting_materials", 0, false);
      return await fulfill(route, { project: current });
    }

    if (suffix === "/materials" && method === "POST") {
      const encodedName = request.headers()["x-file-name"] || "fixture.txt";
      const name = decodeURIComponent(encodedName);
      const type = request.headers()["content-type"] || "application/octet-stream";
      const material = {
        id: `material-${++sequence}`,
        name,
        type,
        size: request.postDataBuffer()?.length || 0,
        addedAt: now(),
        status: "ready",
        pageCount: type === "application/pdf" ? 1 : undefined,
        videoFrameCount: 0,
        visionImageCount: 0,
      };
      current.materials.push(material);
      current.processing = processing("idle", "extracting", 8, false);
      return await fulfill(route, { project: current, material }, 201);
    }

    const frameMatch = suffix.match(/^\/materials\/([^/]+)\/video-frames$/);
    if (frameMatch && method === "POST") {
      const material = current.materials.find((candidate) => candidate.id === frameMatch[1]);
      if (!material) return await fulfill(route, { code: "material_not_found" }, 404);
      material.videoFrameCount += 1;
      material.visionImageCount = material.videoFrameCount;
      material.videoDurationSeconds = Number(url.searchParams.get("durationSeconds")) || 2;
      return await fulfill(route, { project: current });
    }

    if (suffix === "/processing-runs" && method === "POST") {
      const count = (runCounts.get(projectId) || 0) + 1;
      runCounts.set(projectId, count);
      current.processing = processing("queued", "extracting", 8, false);
      pollsBeforeTerminal.set(projectId, pollsBeforeTerminal.get(projectId) ?? 2);
      return await fulfill(route, { processing: current.processing, runId: current.processing.runId }, 202);
    }

    if (suffix === "/processing" && method === "GET") {
      if (!releasedProjects.has(projectId) && pollsBeforeTerminal.get(projectId) === Number.POSITIVE_INFINITY) {
        current.processing = processing("running", "analyzing_materials", 35, false);
        return await fulfill(route, { processing: current.processing });
      }
      const remaining = pollsBeforeTerminal.get(projectId) ?? 0;
      if (remaining > 0) {
        pollsBeforeTerminal.set(projectId, remaining - 1);
        current.processing = processing("running", remaining > 1 ? "analyzing_materials" : "matching_dekel", remaining > 1 ? 35 : 78, false);
        return await fulfill(route, { processing: current.processing });
      }
      let terminal = terminalByName.get(current.name) || "ready";
      if (terminal === "failed" && (runCounts.get(projectId) || 0) > 1) terminal = "ready";
      current.processing = processing(terminal, terminal === "ready" ? "complete" : "validating", 100, terminal === "ready");
      if (["ready", "needs_review"].includes(terminal)) current.document = readyDocument(current.name);
      return await fulfill(route, { processing: current.processing });
    }

    return await fulfill(route, { code: "fixture_route_missing", message: `${method} ${pathname}` }, 404);
  });

  return {
    setTerminal(name: string, status: TerminalStatus) {
      terminalByName.set(name, status);
    },
    hold(name: string) {
      const current = projects.find((candidate) => candidate.name === name);
      expect(current, `project ${name} must exist before hold`).toBeTruthy();
      pollsBeforeTerminal.set(current!.id, Number.POSITIVE_INFINITY);
    },
    release(name: string) {
      const current = projects.find((candidate) => candidate.name === name);
      expect(current, `project ${name} must exist before release`).toBeTruthy();
      releasedProjects.add(current!.id);
      pollsBeforeTerminal.set(current!.id, 0);
    },
    runCount(name: string) {
      const current = projects.find((candidate) => candidate.name === name);
      return current ? runCounts.get(current.id) || 0 : 0;
    },
  };
}
