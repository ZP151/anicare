import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import { API } from 'typescript/unstable/sync';
import {
  isArrowFunction, isAwaitExpression, isBlock, isCallExpression, isIdentifier, isPropertyAssignment,
  isStringLiteral, isVariableStatement, type Block, type Expression, type Node, type Statement,
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

  it('routes the actual first finalization flow through the typed seam without a preempting finalize assertion', async () => {
    const integrationPath = fileURLToPath(new URL('./hosted.integration.test.ts', import.meta.url));
    const api = new API({ cwd: fileURLToPath(new URL('.', import.meta.url)) });
    const snapshot = api.updateSnapshot({ openFiles: [integrationPath] });
    try {
      const file = snapshot.getDefaultProjectForFile(integrationPath)?.program.getSourceFile(integrationPath);
      if (!file) throw new Error('hosted integration source was not loaded into the TypeScript program');
      let ownerBody: Block | undefined;
      let ownerImplementationCount = 0;
      const findOwnerHappyPath = (node: Node): void => {
        if (isPropertyAssignment(node) && isIdentifier(node.name) && node.name.text === 'runOwnerHappyPath' &&
            isArrowFunction(node.initializer) && isBlock(node.initializer.body)) {
          ownerImplementationCount += 1;
          ownerBody = node.initializer.body;
        }
        node.forEachChild(findOwnerHappyPath);
      };
      findOwnerHappyPath(file);
      if (!ownerBody || ownerImplementationCount !== 1) {
        throw new Error('exactly one runOwnerHappyPath implementation was not found');
      }
      const statements = ownerBody.statements;
      const variableInitializer = (statement: Statement, name: string): Expression | undefined => {
        if (!isVariableStatement(statement)) return undefined;
        return statement.declarationList.declarations.find((declaration) =>
          isIdentifier(declaration.name) && declaration.name.text === name)?.initializer;
      };
      const finalizedIndex = statements.findIndex((statement) => variableInitializer(statement, 'finalized') !== undefined);
      if (finalizedIndex < 0) throw new Error('first finalization result binding was not found');
      const finalizedStatement = statements[finalizedIndex];
      if (!finalizedStatement) throw new Error('first finalization result statement was not found');
      const finalizedInitializer = variableInitializer(finalizedStatement, 'finalized');
      if (!finalizedInitializer || !isAwaitExpression(finalizedInitializer)) {
        throw new Error('first finalization result must bind an awaited call');
      }
      const finalizeStep = finalizedInitializer.expression;
      if (!isCallExpression(finalizeStep) || !isIdentifier(finalizeStep.expression) ||
          finalizeStep.expression.text !== 'atOwnerStep') {
        throw new Error('first finalization result must come directly from atOwnerStep(finalize, finalizeMedia)');
      }
      const [stepName, finalizeOperation] = finalizeStep.arguments;
      if (!stepName || !finalizeOperation || !isStringLiteral(stepName) || stepName.text !== 'finalize' ||
          !isArrowFunction(finalizeOperation) ||
          !isCallExpression(finalizeOperation.body) || !isIdentifier(finalizeOperation.body.expression) ||
          finalizeOperation.body.expression.text !== 'finalizeMedia') {
        throw new Error('first finalization result must come directly from atOwnerStep(finalize, finalizeMedia)');
      }
      const seamStatement = statements[finalizedIndex + 1];
      if (!seamStatement) throw new Error('finalize diagnostic seam statement was not found');
      const seamInitializer = variableInitializer(seamStatement, 'confirmedMediaAssetId');
      if (!seamInitializer || !isCallExpression(seamInitializer) || !isIdentifier(seamInitializer.expression) ||
          seamInitializer.expression.text !== 'ownerFinalizedMediaAssetId' || seamInitializer.arguments.length !== 1) {
        throw new Error('the first finalization result must flow immediately into ownerFinalizedMediaAssetId(finalized)');
      }
      const [seamArgument] = seamInitializer.arguments;
      if (!seamArgument || !isIdentifier(seamArgument) || seamArgument.text !== 'finalized') {
        throw new Error('the first finalization result must flow immediately into ownerFinalizedMediaAssetId(finalized)');
      }
      let preemptingFinalizeAssertion = false;
      const inspectForPreemption = (node: Node): void => {
        const [assertionStep] = isCallExpression(node) ? node.arguments : [];
        if (isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === 'requireOwnerStep' &&
            assertionStep && isStringLiteral(assertionStep) && assertionStep.text === 'finalize') {
          preemptingFinalizeAssertion = true;
        }
        node.forEachChild(inspectForPreemption);
      };
      for (const statement of statements.slice(0, finalizedIndex + 1)) inspectForPreemption(statement);
      expect(preemptingFinalizeAssertion).toBe(false);
    } finally {
      snapshot.dispose();
      api.close();
    }
  });
});
