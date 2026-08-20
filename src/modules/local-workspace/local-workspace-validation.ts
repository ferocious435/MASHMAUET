import { z } from "zod";
import { LocalWorkspaceError } from "./local-workspace-error.ts";

const shortText = z.string().trim().max(20_000);
const boqRowSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  code: z.string().max(120),
  description: z.string().max(5_000),
  unit: z.string().max(100),
  quantity: z.number().finite().nonnegative().max(1_000_000_000),
  unitPrice: z.number().finite().nonnegative().max(1_000_000_000),
  category: z.string().max(500),
}).strict();

const evidenceSourceSchema = z.object({
  materialId: z.string().trim().min(1).max(120).optional(),
  fileName: z.string().trim().min(1).max(500).optional(),
  location: z.string().trim().max(500).optional(),
  excerpt: z.string().trim().max(5_000).optional(),
}).strict();

const evidenceNoteSchema = z.object({
  id: z.string().trim().min(1).max(120),
  anchorType: z.literal("boqRow"),
  anchorId: z.string().trim().min(1).max(120),
  kind: z.enum(["inference", "source", "calculation"]),
  title: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(5_000),
  reason: z.string().trim().min(1).max(5_000),
  confidence: z.enum(["high", "medium", "low"]),
  source: evidenceSourceSchema.optional(),
}).strict();

export const documentSchema = z.object({
  subject: shortText,
  background: shortText,
  objective: shortText,
  scope: z.array(shortText).max(200),
  estimateNotes: z.array(shortText).max(200),
  scheduleRows: z.array(z.object({ stage: shortText, duration: shortText, notes: shortText }).strict()).max(200),
  scheduleNotes: shortText,
  riskRows: z.array(z.object({ risk: shortText, response: shortText, owner: shortText }).strict()).max(200),
  additionalNotes: shortText,
  boqRows: z.array(boqRowSchema).max(5_000),
  evidenceNotes: z.array(evidenceNoteSchema).max(5_000).default([]),
}).strict();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(20_000),
}).strict();

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(20_000).optional(),
  document: documentSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Нет полей для обновления");

export const chatSchema = z.object({ message: z.string().trim().min(1).max(30_000) }).strict();
export const versionSchema = z.object({ label: z.string().trim().min(1).max(100).optional() }).strict();
export const proposalActionSchema = z.object({ scope: z.enum(["project", "global"]).optional(), confirmGlobal: z.boolean().optional() }).strict();
export const backupCreateSchema = z.object({ label: z.string().trim().min(1).max(120).optional() }).strict();
export const confirmationSchema = z.object({ confirm: z.literal(true) }).strict();
export const dekelAnalyzeSchema = z.object({}).strict();
export const dekelLineUpdateSchema = z.object({
  selectedCode: z.string().trim().min(1).max(120).nullable().optional(),
  quantity: z.number().finite().positive().max(1_000_000_000).optional(),
  included: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Нет изменений строки DEKEL");

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues[0];
  const field = detail?.path.join(".");
  throw new LocalWorkspaceError(400, "validation_error", `${field ? `${field}: ` : ""}${detail?.message ?? "Некорректные данные"}`);
}
