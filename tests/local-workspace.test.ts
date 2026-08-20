import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LocalProjectStore } from "../src/modules/local-workspace/local-project-store.ts";
import { extractMaterial } from "../src/modules/local-workspace/material-extractor.ts";
import { createProposals, parseCodexAnswer } from "../src/modules/local-workspace/local-workspace-service.ts";

test("локальные проекты сохраняются между экземплярами хранилища", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-store-"));
  try {
    const first = new LocalProjectStore(root);
    await first.initialize();
    const project = await first.create("Проверка", "Локальное сохранение");
    project.rules.push("Правило проекта");
    await first.save(project);
    const second = new LocalProjectStore(root);
    const restored = await second.get(project.id);
    assert.equal(restored.name, "Проверка");
    assert.deepEqual(restored.rules, ["Правило проекта"]);
    assert.throws(() => second.projectPath("../outside"), /идентификатор/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("реальные PDF, Excel и фото подготавливаются к чтению", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-extract-"));
  try {
    const pdf = await extractMaterial(resolve("HOMER/MISMAH LE DUGMA/MISMAH 1/מסמך 1.pdf"), join(root, "pdf"), material("sample.pdf", "application/pdf"));
    assert.equal(pdf.status, "ready");
    assert.equal(pdf.pageCount, 3);
    assert.equal(pdf.visionImagePaths?.length, 3);

    const excel = await extractMaterial(resolve("HOMER/DEKEL/כל חוזה דקל 17.6.25.xlsx"), join(root, "excel"), material("dekel.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    assert.equal(excel.status, "ready");
    assert.ok((excel.sheetCount ?? 0) >= 1);
    assert.match(await readFile(excel.extractedTextPath!, "utf8"), /פריט SSC/);

    const imagePath = resolve("HOMER/KTAV YAD/IMG_20260414_094821.jpg");
    const image = await extractMaterial(imagePath, join(root, "image"), material("photo.jpg", "image/jpeg"));
    assert.deepEqual(image.visionImagePaths, [imagePath]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex может только предложить разрешённые изменения", () => {
  const parsed = parseCodexAnswer(JSON.stringify({
    answer: "Готово",
    proposedChanges: [
      { path: "objective", valueJson: JSON.stringify("Новая цель"), reason: "Уточнение" },
      { path: "system", valueJson: JSON.stringify("Нельзя"), reason: "Запрещено" },
    ],
    proposedProjectRules: [{ rule: "Всегда сверять итог", reason: "Исправление" }],
    needsMoreInformation: [],
  }));
  const proposals = createProposals(parsed);
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].path, "objective");
  assert.equal(proposals[1].target, "projectRule");
  assert.ok(proposals.every((proposal) => proposal.status === "pending"));
});

test("проект хранит стабильные привязки и доказательные сноски к строкам сметы", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-evidence-"));
  try {
    const store = new LocalProjectStore(root);
    await store.initialize();
    const project = (await store.list())[0];
    const rows = project.document.boqRows as Array<{ id?: string }>;
    const notes = project.document.evidenceNotes as Array<{ id: string; anchorId: string; reason: string; confidence: string }>;
    assert.ok(rows.every((row) => typeof row.id === "string" && row.id.length > 0));
    assert.ok(notes.length >= 1);
    assert.ok(rows.some((row) => row.id === notes[0].anchorId));
    assert.ok(notes[0].reason.length > 0);
    assert.match(notes[0].confidence, /^(high|medium|low)$/);

    await store.save(project);
    const restored = await store.get(project.id);
    assert.deepEqual(restored.document.evidenceNotes, project.document.evidenceNotes);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex может предложить обновление доказательных сносок", () => {
  const note = [{
    id: "note-1", anchorType: "boqRow", anchorId: "row-1", kind: "inference",
    title: "Добавлена сопутствующая работа", explanation: "Добавлена подготовка основания",
    reason: "Технологически необходима", confidence: "high",
  }];
  const proposals = createProposals(parseCodexAnswer(JSON.stringify({
    answer: "Добавил пояснение",
    proposedChanges: [{ path: "evidenceNotes", valueJson: JSON.stringify(note), reason: "Связь допущения со строкой" }],
    proposedProjectRules: [], needsMoreInformation: [],
  })));
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].path, "evidenceNotes");
  assert.deepEqual(proposals[0].value, note);
});

function material(name: string, type: string) {
  return { id: "material-1", name, size: 1, type, addedAt: new Date().toISOString(), status: "processing" as const };
}
