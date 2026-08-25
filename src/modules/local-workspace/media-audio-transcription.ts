import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

export type MediaProcessRequest = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type MediaProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated?: boolean;
};

export interface MediaProcessRunner {
  run(request: MediaProcessRequest): Promise<MediaProcessResult>;
}

export type MediaProbe = {
  durationSeconds: number;
  container: string | null;
  streamCount: number;
  audio?: { codec: string | null; sampleRate: number | null; channels: number | null };
  video?: { codec: string | null; width: number | null; height: number | null };
  provenance: ProbeProvenance;
};

export type ProbeProvenance = {
  sourceSha256: string;
  generatedAt: string;
  ffprobeVersion: string;
  ffprobeName?: string;
  ffprobeSha256?: string;
};

export type TranscriptSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type AudioTranscript = {
  language: string;
  text: string;
  speechDetected: boolean;
  segments: TranscriptSegment[];
  generatedAt: string;
};

export type TranscriptProvenance = ProbeProvenance & {
  engine: "whisper.cpp";
  engineVersion: string;
  engineBinaryName?: string;
  engineBinarySha256?: string;
  ffmpegVersion: string;
  ffmpegName?: string;
  ffmpegSha256?: string;
  modelName: string;
  modelSha256: string;
};

export type CachedAudioTranscriptValidationInput = {
  allowedRootPath: string;
  sourcePath: string;
  transcriptPath: string;
  provenancePath: string;
  ffprobePath: string;
  ffmpegPath: string;
  whisperPath: string;
  whisperModelPath: string;
  ffprobeVersion?: string;
  ffmpegVersion?: string;
  whisperVersion?: string;
};

export type CachedAudioTranscriptValidationResult =
  | { valid: true }
  | { valid: false; reasonCode: "audio_cache_missing" | "audio_cache_empty" | "audio_cache_invalid_provenance" | "audio_cache_unsafe_path" | "audio_cache_source_changed" | "audio_cache_tool_changed" | "audio_cache_model_changed" };

export type MediaFailureStage = "validation" | "probe" | "audio_extraction" | "transcription";

export type MediaProbeResult =
  | { status: "ready"; probe: MediaProbe }
  | { status: "unavailable"; stage: "probe"; reasonCode: "ffprobe_unavailable"; message: string }
  | { status: "failed"; stage: "validation" | "probe"; reasonCode: string; message: string };

export type AudioTranscriptionResult =
  | { status: "completed"; probe: MediaProbe; transcript: AudioTranscript; provenance: TranscriptProvenance }
  | { status: "no_audio"; probe: MediaProbe; provenance: ProbeProvenance }
  | { status: "unavailable"; stage: "probe" | "transcription"; reasonCode: string; message: string; probe?: MediaProbe }
  | { status: "failed"; stage: MediaFailureStage; reasonCode: string; message: string; probe?: MediaProbe };

export interface AudioTranscriptionGateway {
  probe(input: { sourcePath: string }): Promise<MediaProbeResult>;
  transcribe(input: { sourcePath: string; workingDirectory: string; language?: string }): Promise<AudioTranscriptionResult>;
  validateCache?(input: { sourcePath: string; transcriptPath: string; provenancePath: string }): Promise<CachedAudioTranscriptValidationResult>;
}

export type LocalAudioTranscriptionOptions = {
  allowedRootPath: string;
  ffprobePath?: string;
  ffmpegPath?: string;
  whisperPath?: string;
  whisperModelPath?: string;
  ffprobeVersion?: string;
  ffmpegVersion?: string;
  whisperVersion?: string;
  probeTimeoutMs?: number;
  extractionTimeoutMs?: number;
  transcriptionTimeoutMs?: number;
  maxDurationSeconds?: number;
  maxDimensionPixels?: number;
};

export type SafeMediaSpawnOptions = {
  cwd: string;
  shell: false;
  windowsHide: true;
  stdio: ["ignore", "pipe", "pipe"];
};

export function buildSafeSpawnOptions(cwd: string): SafeMediaSpawnOptions {
  return { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
}

export class SpawnMediaProcessRunner implements MediaProcessRunner {
  async run(request: MediaProcessRequest): Promise<MediaProcessResult> {
    await assertExecutable(request.command);
    await assertDirectory(request.cwd);
    if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 30 * 60_000) throw new Error("invalid process timeout");
    if (!Number.isInteger(request.maxOutputBytes) || request.maxOutputBytes < 1 || request.maxOutputBytes > 16 * 1024 * 1024) throw new Error("invalid process output limit");
    if (request.args.some((argument) => argument.includes("\0"))) throw new Error("invalid process argument");

    return await new Promise<MediaProcessResult>((resolvePromise, rejectPromise) => {
      const child = spawn(request.command, request.args, buildSafeSpawnOptions(request.cwd));
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let capturedBytes = 0;
      let outputTruncated = false;
      let timedOut = false;
      let settled = false;
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        const remaining = Math.max(0, request.maxOutputBytes - capturedBytes);
        const accepted = chunk.subarray(0, remaining);
        capturedBytes += accepted.length;
        if (accepted.length < chunk.length) outputTruncated = true;
        if (target === "stdout") stdout = Buffer.concat([stdout, accepted]);
        else stderr = Buffer.concat([stderr, accepted]);
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, request.timeoutMs);
      const finish = (result: MediaProcessResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(result);
      };
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      });
      child.once("close", (exitCode) => finish({
        exitCode,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        outputTruncated,
      }));
    });
  }
}

export class LocalAudioTranscriptionGateway implements AudioTranscriptionGateway {
  private readonly options: LocalAudioTranscriptionOptions;
  private readonly runner: MediaProcessRunner;

  constructor(options: LocalAudioTranscriptionOptions, runner: MediaProcessRunner = new SpawnMediaProcessRunner()) {
    this.options = options;
    this.runner = runner;
  }

  async validateCache(input: { sourcePath: string; transcriptPath: string; provenancePath: string }): Promise<CachedAudioTranscriptValidationResult> {
    if (!this.options.ffprobePath || !this.options.ffmpegPath || !this.options.whisperPath || !this.options.whisperModelPath) {
      return { valid: false, reasonCode: "audio_cache_tool_changed" };
    }
    return await validateCachedAudioTranscript({
      ...input,
      allowedRootPath: this.options.allowedRootPath,
      ffprobePath: this.options.ffprobePath,
      ffmpegPath: this.options.ffmpegPath,
      whisperPath: this.options.whisperPath,
      whisperModelPath: this.options.whisperModelPath,
      ffprobeVersion: this.options.ffprobeVersion,
      ffmpegVersion: this.options.ffmpegVersion,
      whisperVersion: this.options.whisperVersion,
    });
  }

  async probe(input: { sourcePath: string }): Promise<MediaProbeResult> {
    let safe: { sourcePath: string; allowedRootPath: string; sourceSha256: string };
    try {
      safe = await this.validateSource(input.sourcePath);
    } catch {
      return failed("validation", "unsafe_media_path", "Медиафайл находится вне разрешённой локальной папки или недоступен.");
    }
    if (!await isRegularAbsoluteFile(this.options.ffprobePath)) {
      return { status: "unavailable", stage: "probe", reasonCode: "ffprobe_unavailable", message: "Локальный ffprobe не настроен или недоступен." };
    }
    const result = await this.runTool({
      command: this.options.ffprobePath!,
      args: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", safe.sourcePath],
      cwd: safe.allowedRootPath,
      timeoutMs: this.options.probeTimeoutMs ?? 30_000,
      maxOutputBytes: 2 * 1024 * 1024,
    }).catch(() => undefined);
    if (!result) return failed("probe", "probe_failed", "Не удалось запустить локальную проверку медиафайла.");
    if (result.timedOut) return failed("probe", "probe_timeout", "Проверка медиафайла превысила допустимое время.");
    if (result.exitCode !== 0 || result.outputTruncated) return failed("probe", "probe_failed", "Локальная проверка медиафайла завершилась ошибкой.");
    try {
      const ffprobeSha256 = await sha256File(this.options.ffprobePath!);
      const probe = parseProbe(result.stdout, {
        sourceSha256: safe.sourceSha256,
        generatedAt: new Date().toISOString(),
        ffprobeVersion: this.options.ffprobeVersion ?? "unknown",
        ffprobeName: basename(this.options.ffprobePath!),
        ffprobeSha256,
      });
      if (probe.durationSeconds > (this.options.maxDurationSeconds ?? 7_200)) return failed("probe", "media_duration_limit", "Видео превышает разрешённую длительность.");
      const largestDimension = Math.max(probe.video?.width ?? 0, probe.video?.height ?? 0);
      if (largestDimension > (this.options.maxDimensionPixels ?? 8_192)) return failed("probe", "media_dimension_limit", "Разрешение видео превышает безопасный предел.");
      if (probe.streamCount > 32) return failed("probe", "media_stream_limit", "В медиафайле слишком много потоков.");
      return { status: "ready", probe };
    } catch {
      return failed("probe", "invalid_probe_output", "ffprobe вернул некорректные сведения о медиафайле.");
    }
  }

  async transcribe(input: { sourcePath: string; workingDirectory: string; language?: string }): Promise<AudioTranscriptionResult> {
    const probeResult = await this.probe({ sourcePath: input.sourcePath });
    if (probeResult.status !== "ready") return probeResult;
    const { probe } = probeResult;
    if (!probe.audio) return { status: "no_audio", probe, provenance: probe.provenance };
    if (!await isRegularAbsoluteFile(this.options.ffmpegPath)
      || !await isRegularAbsoluteFile(this.options.whisperPath)
      || !await isRegularAbsoluteFile(this.options.whisperModelPath)) {
      return { status: "unavailable", stage: "transcription", reasonCode: "transcription_tools_unavailable", message: "Локальные инструменты расшифровки речи ещё не настроены.", probe };
    }

    let safeSource: string;
    let safeWorkingDirectory: string;
    try {
      const safe = await this.validateSource(input.sourcePath);
      safeSource = safe.sourcePath;
      safeWorkingDirectory = await this.validateWorkingDirectory(input.workingDirectory, safe.allowedRootPath);
    } catch {
      return failed("validation", "unsafe_media_path", "Рабочая папка обработки находится вне разрешённого проекта.", probe);
    }
    const temporaryDirectory = join(safeWorkingDirectory, `.audio-${randomUUID()}`);
    await mkdir(temporaryDirectory, { recursive: false });
    const wavPath = join(temporaryDirectory, "audio.wav");
    const outputBase = join(temporaryDirectory, "transcript");
    try {
      const extraction = await this.runTool({
        command: this.options.ffmpegPath!,
        args: ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", safeSource, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath],
        cwd: temporaryDirectory,
        timeoutMs: this.options.extractionTimeoutMs ?? 120_000,
        maxOutputBytes: 1 * 1024 * 1024,
      }).catch(() => undefined);
      if (!extraction) return failed("audio_extraction", "audio_extraction_failed", "Не удалось запустить извлечение звуковой дорожки.", probe);
      if (extraction.timedOut) return failed("audio_extraction", "audio_extraction_timeout", "Извлечение звука превысило допустимое время.", probe);
      if (extraction.exitCode !== 0 || !await isNonEmptyFile(wavPath)) return failed("audio_extraction", "audio_extraction_failed", "Не удалось извлечь звуковую дорожку из видео.", probe);

      const language = normalizeLanguage(input.language);
      const transcription = await this.runTool({
        command: this.options.whisperPath!,
        args: ["-m", this.options.whisperModelPath!, "-f", wavPath, "-l", language, "-ojf", "-of", outputBase, "-np"],
        cwd: temporaryDirectory,
        timeoutMs: this.options.transcriptionTimeoutMs ?? 15 * 60_000,
        maxOutputBytes: 2 * 1024 * 1024,
      }).catch(() => undefined);
      if (!transcription) return failed("transcription", "transcription_failed", "Не удалось запустить локальное распознавание речи.", probe);
      if (transcription.timedOut) return failed("transcription", "transcription_timeout", "Распознавание речи превысило допустимое время.", probe);
      if (transcription.exitCode !== 0) return failed("transcription", "transcription_failed", "Локальное распознавание речи завершилось ошибкой.", probe);

      let transcript: AudioTranscript;
      try {
        const json = await readFile(`${outputBase}.json`, "utf8");
        if (Buffer.byteLength(json) > 10 * 1024 * 1024) throw new Error("transcript output too large");
        transcript = parseWhisperTranscript(json, language);
      } catch {
        return failed("transcription", "invalid_transcript_output", "Whisper вернул некорректную расшифровку.", probe);
      }
      const [modelSha256, ffmpegSha256, engineBinarySha256] = await Promise.all([
        sha256File(this.options.whisperModelPath!),
        sha256File(this.options.ffmpegPath!),
        sha256File(this.options.whisperPath!),
      ]);
      return {
        status: "completed",
        probe,
        transcript,
        provenance: {
          ...probe.provenance,
          engine: "whisper.cpp",
          engineVersion: this.options.whisperVersion ?? "unknown",
          engineBinaryName: basename(this.options.whisperPath!),
          engineBinarySha256,
          ffmpegVersion: this.options.ffmpegVersion ?? "unknown",
          ffmpegName: basename(this.options.ffmpegPath!),
          ffmpegSha256,
          modelName: basename(this.options.whisperModelPath!),
          modelSha256,
        },
      };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async validateSource(sourcePath: string): Promise<{ sourcePath: string; allowedRootPath: string; sourceSha256: string }> {
    if (!isAbsolute(sourcePath) || !isAbsolute(this.options.allowedRootPath)) throw new Error("paths must be absolute");
    const allowedRootPath = await realpath(this.options.allowedRootPath);
    const safeSourcePath = await realpath(sourcePath);
    if (!isInside(allowedRootPath, safeSourcePath) || !(await stat(safeSourcePath)).isFile()) throw new Error("unsafe source path");
    return { sourcePath: safeSourcePath, allowedRootPath, sourceSha256: await sha256File(safeSourcePath) };
  }

  private async validateWorkingDirectory(path: string, allowedRootPath: string): Promise<string> {
    if (!isAbsolute(path)) throw new Error("working path must be absolute");
    const resolved = resolve(path);
    if (!isInside(allowedRootPath, resolved)) throw new Error("unsafe working path");
    await mkdir(resolved, { recursive: true });
    const canonical = await realpath(resolved);
    if (!isInside(allowedRootPath, canonical)) throw new Error("unsafe working path");
    return canonical;
  }

  private async runTool(request: MediaProcessRequest): Promise<MediaProcessResult> {
    return await this.runner.run(request);
  }
}

export async function validateCachedAudioTranscript(input: CachedAudioTranscriptValidationInput): Promise<CachedAudioTranscriptValidationResult> {
  let allowedRootPath: string;
  let sourcePath: string;
  let transcriptPath: string;
  let provenancePath: string;
  try {
    if (![input.allowedRootPath, input.sourcePath, input.transcriptPath, input.provenancePath].every(isAbsolute)) {
      return { valid: false, reasonCode: "audio_cache_unsafe_path" };
    }
    allowedRootPath = await realpath(input.allowedRootPath);
    [sourcePath, transcriptPath, provenancePath] = await Promise.all([
      realpath(input.sourcePath), realpath(input.transcriptPath), realpath(input.provenancePath),
    ]);
    if (![sourcePath, transcriptPath, provenancePath].every((path) => isInside(allowedRootPath, path))) {
      return { valid: false, reasonCode: "audio_cache_unsafe_path" };
    }
    if (!(await stat(sourcePath)).isFile() || !(await stat(transcriptPath)).isFile() || !(await stat(provenancePath)).isFile()) {
      return { valid: false, reasonCode: "audio_cache_missing" };
    }
  } catch {
    return { valid: false, reasonCode: "audio_cache_missing" };
  }

  let transcript: string;
  let provenance: Record<string, unknown>;
  try {
    const [transcriptBytes, provenanceBytes] = await Promise.all([readFile(transcriptPath), readFile(provenancePath)]);
    if (transcriptBytes.length > 10 * 1024 * 1024 || provenanceBytes.length > 64 * 1024) return { valid: false, reasonCode: "audio_cache_invalid_provenance" };
    transcript = transcriptBytes.toString("utf8");
    provenance = JSON.parse(provenanceBytes.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { valid: false, reasonCode: "audio_cache_invalid_provenance" };
  }
  if (!transcript.trim()) return { valid: false, reasonCode: "audio_cache_empty" };
  if (!isCompleteTranscriptProvenance(provenance)) return { valid: false, reasonCode: "audio_cache_invalid_provenance" };

  if (await sha256File(sourcePath) !== provenance.sourceSha256) return { valid: false, reasonCode: "audio_cache_source_changed" };
  if (!await toolIdentityMatches(input.whisperModelPath, provenance.modelName, provenance.modelSha256)) {
    return { valid: false, reasonCode: "audio_cache_model_changed" };
  }
  const toolsMatch = await Promise.all([
    toolIdentityMatches(input.ffprobePath, provenance.ffprobeName, provenance.ffprobeSha256),
    toolIdentityMatches(input.ffmpegPath, provenance.ffmpegName, provenance.ffmpegSha256),
    toolIdentityMatches(input.whisperPath, provenance.engineBinaryName, provenance.engineBinarySha256),
  ]);
  if (toolsMatch.some((match) => !match)
    || (input.ffprobeVersion != null && provenance.ffprobeVersion !== input.ffprobeVersion)
    || (input.ffmpegVersion != null && provenance.ffmpegVersion !== input.ffmpegVersion)
    || (input.whisperVersion != null && provenance.engineVersion !== input.whisperVersion)) {
    return { valid: false, reasonCode: "audio_cache_tool_changed" };
  }
  return { valid: true };
}

function parseProbe(raw: string, provenance: ProbeProvenance): MediaProbe {
  const value = JSON.parse(raw) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  if (!Array.isArray(value.streams) || !value.format || typeof value.format !== "object") throw new Error("invalid probe");
  const duration = finiteNumber(value.format.duration)
    ?? value.streams.map((stream) => finiteNumber(stream.duration)).filter((item): item is number => item != null).sort((a, b) => b - a)[0];
  if (duration == null || duration < 0) throw new Error("invalid duration");
  const audio = value.streams.find((stream) => stream.codec_type === "audio");
  const video = value.streams.find((stream) => stream.codec_type === "video");
  return {
    durationSeconds: duration,
    container: typeof value.format.format_name === "string" ? value.format.format_name : null,
    streamCount: value.streams.length,
    audio: audio ? {
      codec: stringOrNull(audio.codec_name),
      sampleRate: finiteNumber(audio.sample_rate),
      channels: finiteNumber(audio.channels),
    } : undefined,
    video: video ? {
      codec: stringOrNull(video.codec_name),
      width: finiteNumber(video.width),
      height: finiteNumber(video.height),
    } : undefined,
    provenance,
  };
}

function parseWhisperTranscript(raw: string, requestedLanguage: string): AudioTranscript {
  const value = JSON.parse(raw) as {
    result?: { language?: unknown };
    language?: unknown;
    transcription?: Array<Record<string, unknown>>;
    segments?: Array<Record<string, unknown>>;
  };
  const sourceSegments = Array.isArray(value.transcription) ? value.transcription : Array.isArray(value.segments) ? value.segments : undefined;
  if (!sourceSegments) throw new Error("segments missing");
  const segments = sourceSegments.map((segment): TranscriptSegment => {
    const timestamps = segment.timestamps && typeof segment.timestamps === "object" ? segment.timestamps as Record<string, unknown> : undefined;
    const offsets = segment.offsets && typeof segment.offsets === "object" ? segment.offsets as Record<string, unknown> : undefined;
    const startSeconds = timestamps ? parseTimestamp(timestamps.from) : millisecondsToSeconds(offsets?.from ?? segment.start);
    const endSeconds = timestamps ? parseTimestamp(timestamps.to) : millisecondsToSeconds(offsets?.to ?? segment.end);
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (startSeconds == null || endSeconds == null || endSeconds < startSeconds || !text) throw new Error("invalid segment");
    return { startSeconds, endSeconds, text };
  });
  const language = typeof value.result?.language === "string" ? value.result.language
    : typeof value.language === "string" ? value.language
      : requestedLanguage;
  return {
    language,
    text: segments.map((segment) => segment.text).join("\n"),
    speechDetected: segments.length > 0,
    segments,
    generatedAt: new Date().toISOString(),
  };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  return Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1_000;
}

function millisecondsToSeconds(value: unknown): number | null {
  const number = finiteNumber(value);
  return number == null ? null : number / 1_000;
}

function normalizeLanguage(value: string | undefined): string {
  const normalized = value?.trim() || "auto";
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(normalized) || normalized === "auto" ? normalized : "auto";
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }

function isCompleteTranscriptProvenance(value: Record<string, unknown>): value is Record<string, string> & { engine: "whisper.cpp" } {
  const required = [
    "sourceSha256", "generatedAt", "ffprobeVersion", "ffprobeName", "ffprobeSha256",
    "engineVersion", "engineBinaryName", "engineBinarySha256", "ffmpegVersion", "ffmpegName", "ffmpegSha256",
    "modelName", "modelSha256",
  ];
  return value.engine === "whisper.cpp"
    && required.every((key) => typeof value[key] === "string" && String(value[key]).length > 0)
    && ["sourceSha256", "ffprobeSha256", "engineBinarySha256", "ffmpegSha256", "modelSha256"]
      .every((key) => /^[a-f0-9]{64}$/i.test(String(value[key])));
}

async function toolIdentityMatches(path: string, expectedName: string, expectedSha256: string): Promise<boolean> {
  if (!await isRegularAbsoluteFile(path) || basename(path) !== expectedName) return false;
  return await sha256File(path) === expectedSha256.toLowerCase();
}

function failed<S extends MediaFailureStage>(stage: S, reasonCode: string, message: string, probe?: MediaProbe): { status: "failed"; stage: S; reasonCode: string; message: string; probe?: MediaProbe } {
  return { status: "failed", stage, reasonCode, message, ...(probe ? { probe } : {}) };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function assertExecutable(path: string): Promise<void> {
  if (!await isRegularAbsoluteFile(path)) throw new Error("process executable is unavailable");
}

async function assertDirectory(path: string): Promise<void> {
  if (!isAbsolute(path) || !(await stat(path)).isDirectory()) throw new Error("process cwd is unavailable");
}

async function isRegularAbsoluteFile(path: string | undefined): Promise<boolean> {
  if (!path || !isAbsolute(path)) return false;
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function isNonEmptyFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() && (await stat(path)).size > 0; } catch { return false; }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolvePromise);
    stream.once("error", rejectPromise);
  });
  return hash.digest("hex");
}
