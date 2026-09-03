import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import { API } from 'typescript/unstable/sync';
import {
  isArrowFunction, isAwaitExpression, isBlock, isCallExpression, isIdentifier, isObjectLiteralExpression,
  isPropertyAccessExpression, isPropertyAssignment, isStringLiteral, isVariableStatement,
  type Block, type CallExpression, type Expression, type Node, type Statement,
} from 'typescript/unstable/ast';

import {
  HostedCheckFailure, hostedCheckIdFromError, hostedMediaStepFromError, hostedOwnerFinalizeOutcomeFromError,
  hostedOwnerStepFromError, ownerFinalizeOutcomeFromActorResult, ownerFinalizedMediaAssetId, runHostedChecks,
  type HostedCheckAdapter,
} from './checks.js';
import type { ActorResult } from '../../pilot-gate-2a/src/actors.js';
import type { HostedGateEnvironment } from './environment.js';

function env(): HostedGateEnvironment {
  return {
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
    serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
    preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
    workflowRunId: 1, workflowRunAttempt: 1,
  };
}

function adapter(overrides: Partial<HostedCheckAdapter> = {}) {
  const order: string[] = [];
  const base: HostedCheckAdapter = {
    verifyAuthRedirects: vi.fn(async (input) => {
      order.push('auth');
      return input.siteUrl === 'animalhelper://' &&
        JSON.stringify(input.additionalRedirectUrls) === JSON.stringify(['animalhelper://auth/callback']);
    }),
    verifyMediaStaging: vi.fn(async (input) => {
      order.push('staging');
      return input.bucket === 'media-staging' && input.public === false &&
        input.fileSizeLimit === 20 * 1024 * 1024 && input.allowedMimeTypes.join(',') === 'image/jpeg';
    }),
    verifyPublicKeyOrigin: vi.fn(async (origin) => { order.push('origin'); return origin === env().apiUrl; }),
    runOwnerHappyPath: vi.fn(async () => { order.push('owner'); return true; }),
    verifyCrossOwnerIsolation: vi.fn(async () => { order.push('isolation'); return true; }),
  };
  return { implementation: { ...base, ...overrides }, order };
}

function isIdentifierNamed(node: Node | undefined, name: string): boolean {
  return Boolean(node && isIdentifier(node) && node.text === name);
}

function isPropertyAccessNamed(node: Node | undefined, object: string, property: string): boolean {
  return Boolean(node && isPropertyAccessExpression(node) &&
    isIdentifierNamed(node.expression, object) && isIdentifierNamed(node.name, property));
}

function callsNamed(node: Node, name: string): CallExpression[] {
  const calls: CallExpression[] = [];
  const visit = (candidate: Node): void => {
    if (isCallExpression(candidate) && isIdentifierNamed(candidate.expression, name)) calls.push(candidate);
    candidate.forEachChild(visit);
  };
  visit(node);
  return calls;
}

function exactlyOne<T>(values: readonly T[], message: string): T {
  if (values.length !== 1) throw new Error(message);
  return values[0]!;
}

function sameSyntaxNode(left: Node, right: Node): boolean {
  return left.kind === right.kind && left.pos === right.pos && left.end === right.end;
}

function ownerStepCalls(body: Block, step: string): CallExpression[] {
  return callsNamed(body, 'atOwnerStep').filter((call) => {
    const [stepName] = call.arguments;
    return Boolean(stepName && isStringLiteral(stepName) && stepName.text === step);
  });
}

function directFinalizeMediaCall(stepCall: CallExpression, step: string): CallExpression {
  const [, operation] = stepCall.arguments;
  if (!operation || !isArrowFunction(operation) || !isCallExpression(operation.body) ||
      !isIdentifierNamed(operation.body.expression, 'finalizeMedia')) {
    throw new Error(`atOwnerStep(${step}) must directly invoke finalizeMedia`);
  }
  const nestedFinalizeCalls = callsNamed(operation, 'finalizeMedia');
  const finalizeCall = exactlyOne(nestedFinalizeCalls, `atOwnerStep(${step}) must contain one finalizeMedia call`);
  if (!sameSyntaxNode(operation.body, finalizeCall)) {
    throw new Error(`atOwnerStep(${step}) must use finalizeMedia as its direct operation`);
  }
  return finalizeCall;
}

function objectPropertyValue(node: Node | undefined, name: string): Expression | undefined {
  if (!node || !isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (isPropertyAssignment(property) && isIdentifierNamed(property.name, name)) return property.initializer;
  }
  return undefined;
}

function assertFirstFinalizeArguments(call: CallExpression): void {
  const [owner, payload] = call.arguments;
  if (!isPropertyAccessNamed(owner, 'scenario', 'owner') ||
      !isPropertyAccessNamed(objectPropertyValue(payload, 'sightingId'), 'scenario', 'ownerSightingId') ||
      !isIdentifierNamed(objectPropertyValue(payload, 'mediaId'), 'confirmedMediaId') ||
      !isPropertyAccessNamed(objectPropertyValue(payload, 'sha256'), 'jpeg', 'sha256')) {
    throw new Error('first finalizeMedia call must use the owner scenario and confirmed owner media input');
  }
}

function awaitedCallBinding(statements: readonly Statement[], expected: CallExpression): { index: number; name: string } {
  const matches: Array<{ index: number; name: string }> = [];
  for (const [index, statement] of statements.entries()) {
    if (!isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!isIdentifier(declaration.name) || !declaration.initializer || !isAwaitExpression(declaration.initializer) ||
          !sameSyntaxNode(declaration.initializer.expression, expected)) continue;
      matches.push({ index, name: declaration.name.text });
    }
  }
  return exactlyOne(matches, 'first finalize result must have one awaited identifier binding');
}

function isDirectOwnerFinalizeSeam(statement: Statement | undefined, resultName: string): boolean {
  if (!statement || !isVariableStatement(statement)) return false;
  return statement.declarationList.declarations.some((declaration) => {
    if (!declaration.initializer || !isCallExpression(declaration.initializer) ||
        !isIdentifierNamed(declaration.initializer.expression, 'ownerFinalizedMediaAssetId') ||
        declaration.initializer.arguments.length !== 1) return false;
    return isIdentifierNamed(declaration.initializer.arguments[0], resultName);
  });
}

function containsFinalizeAssertion(node: Node): boolean {
  return callsNamed(node, 'requireOwnerStep').some((call) => {
    const [step] = call.arguments;
    return Boolean(step && isStringLiteral(step) && step.text === 'finalize');
  });
}

function findOwnerHappyPathBody(file: Node): Block {
  const bodies: Block[] = [];
  const visit = (node: Node): void => {
    if (isPropertyAssignment(node) && isIdentifierNamed(node.name, 'runOwnerHappyPath') &&
        isArrowFunction(node.initializer) && isBlock(node.initializer.body)) {
      bodies.push(node.initializer.body);
    }
    node.forEachChild(visit);
  };
  visit(file);
  return exactlyOne(bodies, 'exactly one runOwnerHappyPath implementation was not found');
}

describe('hosted check coordinator', () => {
  it('runs the five fixed checks serially and returns only passed evidence values', async () => {
    const fake = adapter();
    await expect(runHostedChecks(env(), fake.implementation)).resolves.toEqual({
      authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
      syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
    });
    expect(fake.order).toEqual(['auth', 'origin', 'owner', 'staging', 'isolation']);
  });

  it.each([
    'verifyAuthRedirects', 'verifyMediaStaging', 'verifyPublicKeyOrigin',
    'runOwnerHappyPath', 'verifyCrossOwnerIsolation',
  ] as const)('fails closed at %s and does not emit partial check values', async (method) => {
    const fake = adapter({ [method]: vi.fn(async () => false) });
    await expect(runHostedChecks(env(), fake.implementation)).rejects.toThrow('hosted_checks_failed');
    expect(fake.order.length).toBeLessThan(5);
  });

  it.each([
    ['verifyAuthRedirects', 'auth_redirect'],
    ['verifyPublicKeyOrigin', 'public_origin'],
    ['runOwnerHappyPath', 'owner_happy_path'],
    ['verifyMediaStaging', 'media_staging'],
    ['verifyCrossOwnerIsolation', 'cross_owner_isolation'],
  ] as const)('marks the fixed failing check %s without accepting adapter error text', async (method, checkId) => {
    const fake = adapter({ [method]: vi.fn(async () => { throw new Error('Bearer secret https://hostile.invalid'); }) });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(error).toHaveProperty('message', 'hosted_checks_failed');
      expect(hostedCheckIdFromError(error)).toBe(checkId);
    }
  });

  it('uses only public configuration constants for static assertions', async () => {
    const fake = adapter();
    await runHostedChecks(env(), fake.implementation);
    expect(fake.implementation.verifyAuthRedirects).toHaveBeenCalledWith({
      siteUrl: 'animalhelper://', additionalRedirectUrls: ['animalhelper://auth/callback'],
    });
    expect(fake.implementation.verifyMediaStaging).toHaveBeenCalledWith({
      bucket: 'media-staging', public: false, fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg'],
    });
    expect(fake.implementation.verifyPublicKeyOrigin).toHaveBeenCalledWith(env().apiUrl);
  });

  it('preserves only a fixed media-staging step from a typed adapter failure', async () => {
    const fake = adapter({
      verifyMediaStaging: vi.fn(async () => {
        throw new HostedCheckFailure('media_staging', 'privacy_read_equivalence');
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedCheckIdFromError(error)).toBe('media_staging');
      expect(hostedMediaStepFromError(error)).toBe('privacy_read_equivalence');
    }
  });

  it('preserves only a fixed owner-happy-path step from a typed adapter failure', async () => {
    const fake = adapter({
      runOwnerHappyPath: vi.fn(async () => {
        throw new HostedCheckFailure('owner_happy_path', undefined, 'replay');
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedCheckIdFromError(error)).toBe('owner_happy_path');
      expect(hostedOwnerStepFromError(error)).toBe('replay');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBeUndefined();
      expect(hostedMediaStepFromError(error)).toBeUndefined();
    }
  });

  it.each([
    [{ ok: false, stage: 'finalize', kind: 'network', status: null, code: 'network_error' }, 'network'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 401, code: 'authentication_required' }, 'http_401_authentication_required'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 401, code: 'Bearer secret' }, 'http_other'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 403, code: 'media_not_found_or_forbidden' }, 'http_403_media_not_found_or_forbidden'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 403, code: 'media_transport_failed' }, 'http_403_unclassified'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 409, code: 'media_finalization_conflict' }, 'http_409_media_finalization_conflict'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 409, code: 'https://hostile.invalid' }, 'http_other'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 503, code: 'service_unavailable' }, 'http_503_service_unavailable'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 503, code: 'unexpected_failure' }, 'http_other'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 500, code: 'media_transport_failed' }, 'http_other'],
    [{ ok: false, stage: 'finalize', kind: 'invalid_response', status: null, code: 'invalid_response' }, 'invalid_response'],
  ] as const)('maps the bounded first finalization result %# to %s', (result, outcome) => {
    expect(ownerFinalizeOutcomeFromActorResult(result as ActorResult)).toBe(outcome);
  });

  it('suppresses successful finalization results with an asset and malformed inputs without exposing their details', () => {
    expect(ownerFinalizeOutcomeFromActorResult({ ok: true, status: 200, mediaAssetId: 'asset' })).toBeUndefined();
    expect(ownerFinalizeOutcomeFromActorResult({
      ok: false, stage: 'finalize', kind: 'http', status: 'Bearer secret', code: 'https://hostile.invalid',
    } as never)).toBeUndefined();
  });

  it('carries a failed first owner finalization ActorResult into its typed diagnostic failure', () => {
    try {
      ownerFinalizedMediaAssetId({
        ok: false, stage: 'finalize', kind: 'http', status: 409, code: 'media_finalization_conflict',
      });
      throw new Error('expected owner finalize failure');
    } catch (error) {
      expect(hostedOwnerStepFromError(error)).toBe('finalize');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBe('http_409_media_finalization_conflict');
    }
  });

  it('classifies a successful first finalization without a media asset as invalid_response', () => {
    try {
      ownerFinalizedMediaAssetId({ ok: true, status: 200 });
      throw new Error('expected owner finalize failure');
    } catch (error) {
      expect(hostedOwnerStepFromError(error)).toBe('finalize');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBe('invalid_response');
    }
  });

  it('propagates a fixed finalization outcome only from a typed owner-finalize failure', async () => {
    const fake = adapter({
      runOwnerHappyPath: vi.fn(async () => {
        throw new HostedCheckFailure(
          'owner_happy_path', undefined, 'finalize', 'http_409_media_finalization_conflict',
        );
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedOwnerStepFromError(error)).toBe('finalize');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBe('http_409_media_finalization_conflict');
    }
  });

  it('protects the uniquely identified first finalize call and preserves the separate replay call', async () => {
    const integrationPath = fileURLToPath(new URL('./hosted.integration.test.ts', import.meta.url));
    const api = new API({ cwd: fileURLToPath(new URL('.', import.meta.url)) });
    const snapshot = api.updateSnapshot({ openFiles: [integrationPath] });
    try {
      const file = snapshot.getDefaultProjectForFile(integrationPath)?.program.getSourceFile(integrationPath);
      if (!file) throw new Error('hosted integration source was not loaded into the TypeScript program');
      const ownerBody = findOwnerHappyPathBody(file);
      const statements = ownerBody.statements;
      const firstFinalizeStep = exactlyOne(ownerStepCalls(ownerBody, 'finalize'),
        'runOwnerHappyPath must contain one finalize step');
      const replayStep = exactlyOne(ownerStepCalls(ownerBody, 'replay'),
        'runOwnerHappyPath must contain one replay step');
      const firstFinalizeCall = directFinalizeMediaCall(firstFinalizeStep, 'finalize');
      const replayFinalizeCall = directFinalizeMediaCall(replayStep, 'replay');
      const allFinalizeCalls = callsNamed(ownerBody, 'finalizeMedia');
      if (allFinalizeCalls.length !== 2 || !allFinalizeCalls.some((call) => sameSyntaxNode(call, firstFinalizeCall)) ||
          !allFinalizeCalls.some((call) => sameSyntaxNode(call, replayFinalizeCall))) {
        throw new Error('runOwnerHappyPath must contain only the distinct finalize and replay finalizeMedia calls');
      }
      assertFirstFinalizeArguments(firstFinalizeCall);
      const firstFinalizeBinding = awaitedCallBinding(statements, firstFinalizeStep);
      const replayBinding = awaitedCallBinding(statements, replayStep);
      if (firstFinalizeCall.pos >= replayFinalizeCall.pos || firstFinalizeBinding.index >= replayBinding.index) {
        throw new Error('the first finalize call and binding must precede the replay call and binding');
      }
      if (!isDirectOwnerFinalizeSeam(statements[firstFinalizeBinding.index + 1], firstFinalizeBinding.name)) {
        throw new Error('the first finalize result must flow immediately into ownerFinalizedMediaAssetId');
      }
      for (const statement of statements.slice(0, firstFinalizeBinding.index + 2)) {
        if (containsFinalizeAssertion(statement)) {
          throw new Error('a literal finalize requireOwnerStep assertion may not preempt the typed seam');
        }
      }
    } finally {
      snapshot.dispose();
      api.close();
    }
  });
});
