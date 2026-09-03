import { chmod, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  HOSTED_CHECK_IDS, HOSTED_MEDIA_STAGING_STEPS, HOSTED_OWNER_FINALIZE_OUTCOMES, HOSTED_OWNER_HAPPY_PATH_STEPS,
  type HostedCheckId, type HostedMediaStagingStep, type HostedOwnerFinalizeOutcome, type HostedOwnerHappyPathStep,
} from './checks.js';
import { GATE_STAGES, type HostedGateControl } from './execute.js';

const FILENAME = 'hosted-check-diagnostic.json';
const MAX_CANONICAL_CONTROL_BYTES = 320;

function invalid(): never { throw new Error('hosted_check_diagnostic_invalid'); }

function targetPath(file: string): string {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /[\r\n\0]/.test(file)) return invalid();
  const target = path.resolve(file);
  if (path.basename(target) !== FILENAME) return invalid();
  return target;
}

function checkId(value: unknown): HostedCheckId {
  if (typeof value !== 'string' || !(HOSTED_CHECK_IDS as readonly string[]).includes(value)) return invalid();
  return value as HostedCheckId;
}

function mediaStep(value: unknown): HostedMediaStagingStep {
  if (typeof value !== 'string' || !(HOSTED_MEDIA_STAGING_STEPS as readonly string[]).includes(value)) return invalid();
  return value as HostedMediaStagingStep;
}

function ownerStep(value: unknown): HostedOwnerHappyPathStep {
  if (typeof value !== 'string' || !(HOSTED_OWNER_HAPPY_PATH_STEPS as readonly string[]).includes(value)) return invalid();
  return value as HostedOwnerHappyPathStep;
}

function ownerFinalizeOutcome(value: unknown): HostedOwnerFinalizeOutcome {
  if (typeof value !== 'string' || !(HOSTED_OWNER_FINALIZE_OUTCOMES as readonly string[]).includes(value)) return invalid();
  return value as HostedOwnerFinalizeOutcome;
}

function control(value: unknown): HostedGateControl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const candidate = value as Record<string, unknown>;
  const allowedKeys = ['gateStage', 'check', 'mediaStep', 'ownerStep', 'ownerFinalizeOutcome'];
  if (!Object.hasOwn(candidate, 'gateStage') || Object.keys(candidate).some((key) => !allowedKeys.includes(key)) ||
      typeof candidate.gateStage !== 'string' || !(GATE_STAGES as readonly string[]).includes(candidate.gateStage)) return invalid();
  const result: {
    gateStage: HostedGateControl['gateStage']; check?: HostedCheckId; mediaStep?: HostedMediaStagingStep;
    ownerStep?: HostedOwnerHappyPathStep; ownerFinalizeOutcome?: HostedOwnerFinalizeOutcome;
  } = {
    gateStage: candidate.gateStage as HostedGateControl['gateStage'],
  };
  if (Object.hasOwn(candidate, 'check')) {
    if (result.gateStage !== 'checks') return invalid();
    result.check = checkId(candidate.check);
  }
  if (Object.hasOwn(candidate, 'mediaStep')) {
    if (result.check !== 'media_staging') return invalid();
    result.mediaStep = mediaStep(candidate.mediaStep);
  }
  if (Object.hasOwn(candidate, 'ownerStep')) {
    if (result.check !== 'owner_happy_path') return invalid();
    result.ownerStep = ownerStep(candidate.ownerStep);
  }
  if (Object.hasOwn(candidate, 'ownerFinalizeOutcome')) {
    if (result.check !== 'owner_happy_path' || result.ownerStep !== 'finalize') return invalid();
    result.ownerFinalizeOutcome = ownerFinalizeOutcome(candidate.ownerFinalizeOutcome);
  }
  return result;
}

export async function writeHostedCheckDiagnostic(file: string, value: unknown): Promise<void> {
  const target = targetPath(file);
  const record = control(value);
  let canonical = record;
  let source = `${JSON.stringify(canonical)}\n`;
  if (Buffer.byteLength(source, 'utf8') > MAX_CANONICAL_CONTROL_BYTES && canonical.ownerFinalizeOutcome !== undefined) {
    const { ownerFinalizeOutcome: _outcome, ...withoutOutcome } = canonical;
    canonical = withoutOutcome;
    source = `${JSON.stringify(canonical)}\n`;
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_CANONICAL_CONTROL_BYTES) return invalid();
  try {
    await writeFile(target, source, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(target, 0o600);
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() ||
        (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) return invalid();
  } catch {
    return invalid();
  }
}
