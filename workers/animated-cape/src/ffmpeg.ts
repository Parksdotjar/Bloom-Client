import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { workerConfig } from './config.js';
import { WorkerError, type ProbeMetadata } from './types.js';

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function removeDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function runCommand(bin: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn(bin, args, {
      cwd,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    process.on('error', (error) => reject(error));
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${bin} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

export async function probeMedia(sourcePath: string): Promise<ProbeMetadata> {
  const result = await runCommand(workerConfig.ffprobeBin, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    sourcePath
  ]);

  const parsed = JSON.parse(result.stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string; codec_name?: string; pix_fmt?: string }>;
    format?: { duration?: string };
  };

  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const width = Number(video?.width ?? 0);
  const height = Number(video?.height ?? 0);
  const durationSeconds = Number(video?.duration ?? parsed.format?.duration ?? 0);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new WorkerError('invalid_source_dimensions', 'Source media has invalid dimensions.', false);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new WorkerError('invalid_source_duration', 'Source media has invalid duration.', false);
  }

  return {
    width,
    height,
    durationSeconds,
    codecName: video?.codec_name ?? null,
    pixFmt: video?.pix_fmt ?? null
  };
}

export async function extractFrames(params: {
  sourcePath: string;
  outputDir: string;
  fps: number;
  durationSeconds: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  frameWidth: number;
  frameHeight: number;
  maxFrames: number;
}) {
  await ensureDir(params.outputDir);
  const outputPattern = path.join(params.outputDir, 'frame_%05d.png');
  const vf = [
    `fps=${params.fps}`,
    `crop=${params.cropWidth}:${params.cropHeight}:${params.cropX}:${params.cropY}`,
    `scale=${params.frameWidth}:${params.frameHeight}:flags=lanczos:force_original_aspect_ratio=disable`,
    'format=rgba'
  ].join(',');

  await runCommand(workerConfig.ffmpegBin, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    params.sourcePath,
    '-t',
    String(params.durationSeconds),
    '-vf',
    vf,
    '-start_number',
    '0',
    '-frames:v',
    String(params.maxFrames),
    outputPattern
  ]);

  const names = await fs.readdir(params.outputDir);
  const frames = names
    .filter((name) => /^frame_\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => path.join(params.outputDir, name));

  if (!frames.length) {
    throw new WorkerError('frame_extraction_empty', 'ffmpeg extracted zero frames.', false);
  }

  return frames.slice(0, params.maxFrames);
}

export async function makePreviewWebp(params: {
  framesDir: string;
  fps: number;
  outputPath: string;
  width: number;
}) {
  const inputPattern = path.join(params.framesDir, 'frame_%05d.png');
  const vf = `scale=${params.width}:-1:flags=lanczos`;
  await runCommand(workerConfig.ffmpegBin, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    String(params.fps),
    '-i',
    inputPattern,
    '-vf',
    vf,
    '-loop',
    '0',
    '-an',
    '-c:v',
    'libwebp',
    '-quality',
    '75',
    '-compression_level',
    '6',
    params.outputPath
  ]);
}
