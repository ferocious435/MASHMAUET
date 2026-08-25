import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  LocalAudioTranscriptionGateway,
  SpawnMediaProcessRunner,
  buildSafeSpawnOptions,
  validateCachedAudioTranscript,
  type MediaProcessRequest,
  type MediaProcessResult,
  type MediaProcessRunner,
} from "../src/modules/local-workspace/media-audio-transcription.ts";

test("video without an audio stream returns no_audio without invoking extraction or Whisper", async () => {
  await withFixture(async (fixture) => {
    const runner = new ScriptedRunner(async (request) => {
      assert.equal(request.command, process.execPath);
      assert.deepEqual(request.args.slice(0, 4), ["-v", "error", "-print_format", "json"]);
      return successful(JSON.stringify({
        streams: [{ codec_type: "video", codec_name: "h264", width: 478, height: 850, duration: "33.521933" }],
        format: { duration: "33.521933", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      }));
    });
    const gateway = new LocalAudioTranscriptionGateway({
      allowedRootPath: fixture.root,
      ffprobePath: process.execPath,
    }, runner);

    const result = await gateway.transcribe({ sourcePath: fixture.source, workingDirectory: fixture.derived, language: "he" });

    assert.equal(result.status, "no_audio");
    assert.equal(result.probe.durationSeconds, 33.521933);
    assert.equal(result.probe.video?.width, 478);
    assert.match(result.provenance.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(runner.requests.length, 1);
  });
});

test("local Whisper transcript preserves Hebrew text, segment timestamps and provenance", async () => {
  await withFixture(async (fixture) => {
    const modelPath = join(fixture.root, "ggml-medium.bin");
    await writeFile(modelPath, "deterministic-model");
    const runner = new ScriptedRunner(async (request) => {
      if (request.command === process.execPath && request.args.includes("-show_streams")) {
        return successful(JSON.stringify({
          streams: [
            { codec_type: "video", codec_name: "h264", width: 478, height: 850 },
            { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 1 },
          ],
          format: { duration: "33.521933", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
        }));
      }
      if (request.command === process.execPath && request.args.includes("pcm_s16le")) {
        await writeFile(request.args.at(-1)!, Buffer.from([0x52, 0x49, 0x46, 0x46]));
        return successful("");
      }
      assert.equal(request.command, process.execPath);
      assert.ok(request.args.includes("-ojf"));
      assert.deepEqual(request.args.slice(request.args.indexOf("-l"), request.args.indexOf("-l") + 2), ["-l", "he"]);
      const outputBase = request.args[request.args.indexOf("-of") + 1];
      await writeFile(`${outputBase}.json`, JSON.stringify({
        result: { language: "he" },
        transcription: [
          { timestamps: { from: "00:00:01,250", to: "00:00:04,500" }, text: " יש לפרק את התקרה" },
          { timestamps: { from: "00:00:05,000", to: "00:00:07,750" }, text: " ולהשלים חשמל" },
        ],
      }));
      return successful("");
    });
    const gateway = new LocalAudioTranscriptionGateway({
      allowedRootPath: fixture.root,
      ffprobePath: process.execPath,
      ffmpegPath: process.execPath,
      whisperPath: process.execPath,
      whisperModelPath: modelPath,
      ffprobeVersion: "fixture-probe",
      ffmpegVersion: "fixture-ffmpeg",
      whisperVersion: "fixture-whisper",
    }, runner);

    const result = await gateway.transcribe({ sourcePath: fixture.source, workingDirectory: fixture.derived, language: "he" });

    assert.equal(result.status, "completed");
    assert.equal(result.transcript.language, "he");
    assert.equal(result.transcript.text, "יש לפרק את התקרה\nולהשלים חשמל");
    assert.deepEqual(result.transcript.segments.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), [[1.25, 4.5], [5, 7.75]]);
    assert.equal(result.provenance.engine, "whisper.cpp");
    assert.equal(result.provenance.modelName, basename(modelPath));
    assert.match(result.provenance.modelSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.provenance.ffmpegVersion, "fixture-ffmpeg");
    assert.equal(runner.requests.length, 3);
    assert.equal((await readFile(fixture.source)).toString(), "media-source");
  });
});

test("missing local tools and process failures are reported honestly", async (t) => {
  await t.test("missing ffprobe is unavailable", async () => {
    await withFixture(async (fixture) => {
      const gateway = new LocalAudioTranscriptionGateway({ allowedRootPath: fixture.root });
      const result = await gateway.transcribe({ sourcePath: fixture.source, workingDirectory: fixture.derived });
      assert.deepEqual(pick(result, ["status", "stage", "reasonCode"]), {
        status: "unavailable", stage: "probe", reasonCode: "ffprobe_unavailable",
      });
    });
  });

  await t.test("ffprobe timeout is failed", async () => {
    await withFixture(async (fixture) => {
      const runner = new ScriptedRunner(async () => ({ exitCode: null, stdout: "", stderr: "", timedOut: true }));
      const gateway = new LocalAudioTranscriptionGateway({ allowedRootPath: fixture.root, ffprobePath: process.execPath }, runner);
      const result = await gateway.transcribe({ sourcePath: fixture.source, workingDirectory: fixture.derived });
      assert.deepEqual(pick(result, ["status", "stage", "reasonCode"]), {
        status: "failed", stage: "probe", reasonCode: "probe_timeout",
      });
    });
  });

  await t.test("missing Whisper after a successful audio probe is unavailable", async () => {
    await withFixture(async (fixture) => {
      const runner = new ScriptedRunner(async () => successful(JSON.stringify({
        streams: [{ codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 1 }],
        format: { duration: "10" },
      })));
      const gateway = new LocalAudioTranscriptionGateway({ allowedRootPath: fixture.root, ffprobePath: process.execPath }, runner);
      const result = await gateway.transcribe({ sourcePath: fixture.source, workingDirectory: fixture.derived });
      assert.deepEqual(pick(result, ["status", "stage", "reasonCode"]), {
        status: "unavailable", stage: "transcription", reasonCode: "transcription_tools_unavailable",
      });
    });
  });
});

test("unsafe paths are rejected before any process starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-audio-root-"));
  const outside = await mkdtemp(join(tmpdir(), "mashmauet-audio-outside-"));
  try {
    const source = join(outside, "video.mp4");
    await writeFile(source, "outside");
    const runner = new ScriptedRunner(async () => successful("{}"));
    const gateway = new LocalAudioTranscriptionGateway({ allowedRootPath: root, ffprobePath: process.execPath }, runner);

    const result = await gateway.transcribe({ sourcePath: source, workingDirectory: join(root, "derived") });

    assert.deepEqual(pick(result, ["status", "stage", "reasonCode"]), {
      status: "failed", stage: "validation", reasonCode: "unsafe_media_path",
    });
    assert.equal(runner.requests.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("spawn runner uses non-shell hidden processes, bounded output and timeout", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mashmauet-media-runner-"));
  try {
    assert.deepEqual(buildSafeSpawnOptions(cwd), {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const runner = new SpawnMediaProcessRunner();
    const output = await runner.run({
      command: process.execPath,
      args: ["-e", "process.stdout.write('123456789')"],
      cwd,
      timeoutMs: 5_000,
      maxOutputBytes: 5,
    });
    assert.equal(output.exitCode, 0);
    assert.equal(output.stdout, "12345");
    assert.equal(output.outputTruncated, true);

    const timedOut = await runner.run({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000)"],
      cwd,
      timeoutMs: 30,
      maxOutputBytes: 1_000,
    });
    assert.equal(timedOut.timedOut, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("completed transcript cache is reusable only while source, tools and model match provenance", async () => {
  await withFixture(async (fixture) => {
    const paths = {
      ffprobePath: join(fixture.root, "tools", "ffprobe.exe"),
      ffmpegPath: join(fixture.root, "tools", "ffmpeg.exe"),
      whisperPath: join(fixture.root, "tools", "whisper-cli.exe"),
      whisperModelPath: join(fixture.root, "tools", "ggml-medium.bin"),
    };
    await mkdir(join(fixture.root, "tools"), { recursive: true });
    await Promise.all(Object.entries(paths).map(async ([name, path]) => await writeFile(path, `fixture-${name}`)));
    const transcriptPath = join(fixture.derived, "audio-transcript.txt");
    const provenancePath = join(fixture.derived, "audio-provenance.json");
    await mkdir(fixture.derived, { recursive: true });
    await writeFile(transcriptPath, "[00:00:01–00:00:03] יש לבצע פירוק", "utf8");
    const hashes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await fileSha256(path)])));
    await writeFile(provenancePath, JSON.stringify({
      sourceSha256: await fileSha256(fixture.source),
      generatedAt: new Date().toISOString(),
      ffprobeVersion: "6.1.1",
      ffprobeName: basename(paths.ffprobePath),
      ffprobeSha256: hashes.ffprobePath,
      engine: "whisper.cpp",
      engineVersion: "1.9.1",
      engineBinaryName: basename(paths.whisperPath),
      engineBinarySha256: hashes.whisperPath,
      ffmpegVersion: "6.1.1",
      ffmpegName: basename(paths.ffmpegPath),
      ffmpegSha256: hashes.ffmpegPath,
      modelName: basename(paths.whisperModelPath),
      modelSha256: hashes.whisperModelPath,
    }), "utf8");
    const input = {
      allowedRootPath: fixture.root,
      sourcePath: fixture.source,
      transcriptPath,
      provenancePath,
      ...paths,
      ffprobeVersion: "6.1.1",
      ffmpegVersion: "6.1.1",
      whisperVersion: "1.9.1",
    };

    assert.deepEqual(await validateCachedAudioTranscript(input), { valid: true });

    await writeFile(fixture.source, "changed-media-source");
    assert.deepEqual(await validateCachedAudioTranscript(input), { valid: false, reasonCode: "audio_cache_source_changed" });
  });
});

test("LocalAudioTranscriptionGateway validates cache with its own configured tool identity", async () => {
  await withCacheFixture(async ({ input }) => {
    const gateway = new LocalAudioTranscriptionGateway({
      allowedRootPath: input.allowedRootPath,
      ffprobePath: input.ffprobePath,
      ffmpegPath: input.ffmpegPath,
      whisperPath: input.whisperPath,
      whisperModelPath: input.whisperModelPath,
      ffprobeVersion: input.ffprobeVersion,
      ffmpegVersion: input.ffmpegVersion,
      whisperVersion: input.whisperVersion,
    });

    assert.deepEqual(await gateway.validateCache({
      sourcePath: input.sourcePath,
      transcriptPath: input.transcriptPath,
      provenancePath: input.provenancePath,
    }), { valid: true });
  });
});

test("empty, damaged or foreign transcript caches are rejected", async (t) => {
  await t.test("empty transcript is rejected", async () => {
    await withCacheFixture(async ({ input, transcriptPath }) => {
      await writeFile(transcriptPath, "  \n", "utf8");
      assert.deepEqual(await validateCachedAudioTranscript(input), { valid: false, reasonCode: "audio_cache_empty" });
    });
  });

  await t.test("provenance with a foreign model hash is rejected", async () => {
    await withCacheFixture(async ({ input, provenancePath }) => {
      const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
      provenance.modelSha256 = "0".repeat(64);
      await writeFile(provenancePath, JSON.stringify(provenance), "utf8");
      assert.deepEqual(await validateCachedAudioTranscript(input), { valid: false, reasonCode: "audio_cache_model_changed" });
    });
  });

  await t.test("transcript outside the allowed project root is rejected", async () => {
    await withCacheFixture(async ({ input }) => {
      const outside = await mkdtemp(join(tmpdir(), "mashmauet-foreign-cache-"));
      try {
        const transcriptPath = join(outside, "audio-transcript.txt");
        await writeFile(transcriptPath, "foreign", "utf8");
        assert.deepEqual(await validateCachedAudioTranscript({ ...input, transcriptPath }), { valid: false, reasonCode: "audio_cache_unsafe_path" });
      } finally { await rm(outside, { recursive: true, force: true }); }
    });
  });
});

class ScriptedRunner implements MediaProcessRunner {
  readonly requests: MediaProcessRequest[] = [];
  private readonly handler: (request: MediaProcessRequest) => Promise<MediaProcessResult>;
  constructor(handler: (request: MediaProcessRequest) => Promise<MediaProcessResult>) { this.handler = handler; }
  async run(request: MediaProcessRequest): Promise<MediaProcessResult> {
    this.requests.push(structuredClone(request));
    return await this.handler(request);
  }
}

function successful(stdout: string): MediaProcessResult {
  return { exitCode: 0, stdout, stderr: "", timedOut: false, outputTruncated: false };
}

function pick(value: object, keys: string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

async function withFixture(run: (fixture: { root: string; source: string; derived: string }) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "mashmauet-audio-fixture-"));
  try {
    const source = join(root, "materials", "video.mp4");
    const derived = join(root, "derived", "material-id");
    await mkdir(join(root, "materials"), { recursive: true });
    await writeFile(source, "media-source");
    await run({ root, source, derived });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withCacheFixture(run: (fixture: {
  input: Parameters<typeof validateCachedAudioTranscript>[0]; transcriptPath: string; provenancePath: string;
}) => Promise<void>): Promise<void> {
  await withFixture(async (fixture) => {
    const tools = join(fixture.root, "tools");
    await mkdir(tools, { recursive: true });
    const paths = {
      ffprobePath: join(tools, "ffprobe.exe"), ffmpegPath: join(tools, "ffmpeg.exe"),
      whisperPath: join(tools, "whisper-cli.exe"), whisperModelPath: join(tools, "model.bin"),
    };
    await Promise.all(Object.entries(paths).map(async ([key, path]) => await writeFile(path, key)));
    await mkdir(fixture.derived, { recursive: true });
    const transcriptPath = join(fixture.derived, "audio-transcript.txt");
    const provenancePath = join(fixture.derived, "audio-provenance.json");
    await writeFile(transcriptPath, "valid transcript", "utf8");
    await writeFile(provenancePath, JSON.stringify({
      sourceSha256: await fileSha256(fixture.source), generatedAt: new Date().toISOString(),
      ffprobeVersion: "6.1.1", ffprobeName: basename(paths.ffprobePath), ffprobeSha256: await fileSha256(paths.ffprobePath),
      engine: "whisper.cpp", engineVersion: "1.9.1", engineBinaryName: basename(paths.whisperPath), engineBinarySha256: await fileSha256(paths.whisperPath),
      ffmpegVersion: "6.1.1", ffmpegName: basename(paths.ffmpegPath), ffmpegSha256: await fileSha256(paths.ffmpegPath),
      modelName: basename(paths.whisperModelPath), modelSha256: await fileSha256(paths.whisperModelPath),
    }), "utf8");
    await run({
      input: { allowedRootPath: fixture.root, sourcePath: fixture.source, transcriptPath, provenancePath, ...paths, ffprobeVersion: "6.1.1", ffmpegVersion: "6.1.1", whisperVersion: "1.9.1" },
      transcriptPath, provenancePath,
    });
  });
}

async function fileSha256(path: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
