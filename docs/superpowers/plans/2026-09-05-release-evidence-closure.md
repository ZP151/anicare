# Release Evidence Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Independent review is required before integrating security-sensitive changes.

**Goal:** 让已通过 Hosted Gate 的真实证明能够通过规范消费者验证并用于后续交付，同时消除本地 verify 漏掉 SQL 清单检查的缺口。

**Architecture:** 使用现有 `acquireVerifiedPilotGate2BArtifact` / `promotePilotGate2BEvidence` 接口；修正 issuer 排除参数但保留完整来源和摘要约束。真实消费 smoke 使用现有获取函数，只下载/验签/清理，不写仓库 evidence。证据提升继续由既有 fail-closed 命令完成。

**Tech Stack:** Node.js ESM、node:test、GitHub CLI/Sigstore、pnpm、GitHub Actions。

**Spec:** `docs/reviews/2026-09-05-project-acceptance.md` 的 P1-01、P2-03；`docs/iteration-roadmap-v2.md` 的 R0A。iOS 仅在附录定义诊断，不把未确认根因包装为完整修复方案。

**2026-09-05 执行顺序修订：**本计划是首次证据消费/原生候选前的按需支线，不阻塞 R2a Following 等本地合成数据功能开发。Task 1–3 为一个可交付修复切片；最终安全 diff 只做一次独立评审，见 Task 4 Step 1。Task 4 Step 2–4 的证据提升仅在实际需要且在授权范围内执行，不作为代码修复完成的附加门槛。历史缺陷和发布校验保持有效。

**2026-09-07 更新：**功能主线以 [v3](../../iteration-roadmap-v3.md) 的 M1 身份闭环开始；本文 R0A 仍是按需发布支线。Task 3 Step 3a 的同 job 去重及根契约覆盖检查已在本地实现/验证，见 [本轮评审](../../reviews/2026-09-07-product-delivery-review.md)。其余 issuer 修复、source-inventory 接线和证据提升仍未完成；不能因为去重已落地就勾选整个 R0A。

## Global Constraints

- 基线 `6797215dadd02f51ed0d94befb7185dd5989b742`；在已有隔离工作树实施，先确认其他文档/用户修改，不能清空工作树。
- 固定仓库 `ZP151/anicare`、workflow `.github/workflows/hosted-gate-2b.yml`、GitHub-hosted runner、SLSA provenance、source/signer digest 和 source ref 均保留验证。
- 不用 skip verification、修改 JSON 时间戳或手写 passed 值修复证据。
- 只用合成数据；诊断不得输出 secrets、signed URL、对象路径或自由远端错误。
- readiness 有效期恰为 72 小时；消费时刻必须重新检查；签名验证通过不等于业务有效期通过。
- 本计划交付修复、可执行验证命令和 review-ready 结果；合并 PR、改变环境规则或 dispatch device_candidate 不包含在 R0A。

## Task 1：修正真实签发体系兼容性

**Files:**

- Modify: `scripts/promote-pilot-gate-2b-evidence.mjs`
- Test: `scripts/promote-pilot-gate-2b-evidence.test.mjs`
- Modify: `docs/runbooks/hosted-gate-2b.md`

**Interfaces:** 保留 `acquireVerifiedPilotGate2BArtifact({ runId, runAttempt, temporaryRoot, sourceDigest, sourceRef, processAdapter? })`，成功返回 `{ directory, file, cleanup }`，失败抛 `gate_2b_promotion_invalid`。不改变 promotion 或 readiness schema。

- [x] Step 1：在现有 `downloads the exact run-attempt artifact...` 测试的 adapter 中增加以下真实策略模拟。保留其 existing metadata/download fixture，现有 exact args expectation 同时去掉 `--no-public-good`。

```js
if (args[0] === 'attestation' && args.includes('--no-public-good')) {
  throw new Error('public_good_issuer_rejected');
}
```

这是源自真实 A/B 故障的回归，不是安全验证替身；最后必须完成 Task 2 的真实 smoke。

- [x] Step 2：运行 `node --test scripts/promote-pilot-gate-2b-evidence.test.mjs`，确认旧实现失败于 acquisition，而非测试语法或下载 fixture。
- [x] Step 3：只移除消费者和参数期望中这一项，最终参数尾部应为：

```js
'--predicate-type', 'https://slsa.dev/provenance/v1',
'--deny-self-hosted-runners', '--format', 'json',
```

前面的 repo、signer-workflow、signer/source digest、source-ref 不动。不添加接受未知仓库/任意 workflow 的宽松分支。

- [x] Step 4：将现有 `fails closed when attestation verification is absent or malformed` 测试改为 subtest 循环，复用原 metadata/download fixture；每个 case 的 verifier 返回或抛错如下，全部必须 rejects，且临时根目录为空：

```js
const verifierCases = [
  { name: 'empty', invoke: () => ({ stdout: '[]' }) },
  { name: 'malformed', invoke: () => ({ stdout: 'not-json' }) },
  { name: 'missing-result', invoke: () => ({ stdout: '[{}]' }) },
  { name: 'verification-failed', invoke: () => { throw new Error('verification_failed'); } },
];
// Inside each existing fixture-backed adapter, after api/run handling:
// if (args[0] === 'attestation') return candidate.invoke();
// After assert.rejects and before fixture cleanup:
// assert.deepEqual(await readdir(root), []);
```

错 repository/source/workflow/expiry 的现有 promotion 测试继续保留。临时文件清理断言证明失败不会把未验证产物留下。

- [x] Step 5：运行 `node --test scripts/promote-pilot-gate-2b-evidence.test.mjs`；更新 runbook，说明采用 GitHub CLI 支持的可信签发体系，显式 identity/digest 验证仍是必需项，并链接 [官方 verify 参数](https://cli.github.com/manual/gh_attestation_verify)。
- [ ] Step 6：自查参数与负向测试后，可精确提交以上三文件，消息 `fix(gate2b): verify the actual readiness issuer`。独立安全评审统一在 Task 4 Step 1 对最终 diff 执行；此处不重复设置评审门禁。

## Task 2：验证真实 producer → consumer，不提升未经验证的产物

**Files:**

- Create: `scripts/smoke-pilot-gate-2b-artifact.mjs`
- Modify: `docs/runbooks/hosted-gate-2b.md`

**Interfaces:** 命令 `node scripts/smoke-pilot-gate-2b-artifact.mjs RUN_ID ATTEMPT SHA REF`，成功仅输出固定 `gate_2b_artifact_verified`；失败输出固定 `gate_2b_artifact_verification_failed`，非零退出。不写 `docs/evidence`。该 smoke 需要网络，不加入默认 unit tests。

- [x] Step 1：创建以下薄 CLI，复用现有验证及清理能力：

```js
import { tmpdir } from 'node:os';
import { acquireVerifiedPilotGate2BArtifact } from './promote-pilot-gate-2b-evidence.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !/^[1-9][0-9]*$/.test(args[0]) ||
      !/^[1-9][0-9]*$/.test(args[1])) throw new Error('invalid_arguments');
  const acquired = await acquireVerifiedPilotGate2BArtifact({
    runId: Number(args[0]), runAttempt: Number(args[1]),
    temporaryRoot: tmpdir(), sourceDigest: args[2], sourceRef: args[3],
  });
  try {
    process.stdout.write('gate_2b_artifact_verified\n');
  } finally {
    await acquired.cleanup();
  }
}

main().catch(() => {
  process.stderr.write('gate_2b_artifact_verification_failed\n');
  process.exitCode = 1;
});
```

- [ ] Step 2：先查询产物是否仍可下载；可用则执行真实 smoke（此步骤只验签，尚不检查当前工作树/72 小时 readiness）：

```powershell
gh api repos/ZP151/anicare/actions/runs/33784288981/artifacts --jq '.artifacts[] | {name,expired}'
node scripts/smoke-pilot-gate-2b-artifact.mjs 33784288981 1 6797215dadd02f51ed0d94befb7185dd5989b742 refs/heads/codex/hosted-gate-2b
```

Expected: exit 0 / `gate_2b_artifact_verified`。若 artifact 已过 retention，不反复下载；选择符合授权的真实 correctness run，再用它实际 run ID/attempt/SHA/ref。不可把 characterize run 当 correctness evidence。

- [ ] Step 3：用全零 SHA 做只读错误来源控制，要求非零且无规范 evidence 文件变化：

```powershell
node scripts/smoke-pilot-gate-2b-artifact.mjs 33784288981 1 0000000000000000000000000000000000000000 refs/heads/codex/hosted-gate-2b
git status --short -- docs/evidence
```

- [x] Step 4：runbook 明确 smoke 只证明 acquisition/signature；随后真正提升还需 runMetadata、ancestor、migration history、tree hash、业务时间全部通过。记录实际验证时间与所用 SHA，不写“以后始终有效”。
- [ ] Step 5：提交 `test(gate2b): add real artifact consumer smoke`，精确 stage smoke 与 runbook。

## Task 3：让轻量 source inventory 成为本地 verify 的组成部分

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`（只消除 verify job 内被根 verify 包含的重复命令）
- Test: `scripts/root-verify-contract.test.mjs`
- Existing executable: `scripts/pilot-gate-inputs.test.mjs`

**Interfaces:** 新增 package script `test:pilot-source-inventory`，执行 `node --test scripts/pilot-gate-inputs.test.mjs`；根 verify 在 lint 前调用它。CI 的独立 database-contracts 前置检查继续保留。verify job 以 `pnpm verify` 作为已包含检查的唯一入口。

- [x] Step 1：在 root contract 中新增：

```js
test('root verify covers the CI source inventory contract', async () => {
  const pkg = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  assert.equal(pkg.scripts['test:pilot-source-inventory'],
    'node --test scripts/pilot-gate-inputs.test.mjs');
  const commands = pkg.scripts.verify.split(' && ');
  assert.ok(commands.includes('pnpm test:pilot-source-inventory'));
  assert.ok(commands.indexOf('pnpm test:pilot-source-inventory') < commands.indexOf('pnpm lint'));
});
```

- [x] Step 2：`node --test scripts/root-verify-contract.test.mjs`，确认新增 case 在旧 package scripts 上失败。
- [x] Step 3：在 package scripts 增加实际命令，并在 verify 的 `pnpm lint` 之前插入 `pnpm test:pilot-source-inventory && `。不弱化随迁移同步的精确 SQL 清单（当前 28 项），也不在每次本地 verify 启动 Docker。
- [x] Step 3a（2026-09-07 本地实现/验证，未合入）：根 verify 保留 `pnpm validate:pilot-policies`、`pnpm test:root-contracts`、`pnpm test:hosted-gate-2b-workflow`，CI verify job 已删除对应三条重复 run。root contract 现在验证覆盖一次及 job/step 不可跳过/忽略失败，Python/peers 和 database-contracts 保留。后续执行引用实际 diff/测试，不重复删除或重新立审计项。
- [x] Step 4：执行一次 `pnpm verify`，其内部包含 root-contracts/source-inventory，记录退出码；核对 workflow diff 仅移除上述重复 run。只在相关 SQL/Edge 代码变化时本地另跑 Gate 2A，不为脚本接线重复部署；现有必需 CI 继续执行。后续验收引用本次适用结果，不再无变化重跑同组检查。
- [ ] Step 5：提交 `test(ci): include source inventory in root verify`。

## Task 4：一次最终评审；按需提升证据

**Files:**

- Update: `docs/reviews/2026-09-05-project-acceptance.md`（追加实际关闭证据，不覆盖历史事实）
- Generated only by validated promotion: `docs/evidence/pilot-gate-2b-readiness.json`

- [x] Step 1：对 Task 1–3 最终 diff 做一次独立评审，覆盖安全绑定、负向测试和 CI 检查未遗漏；引用 Task 2 已执行的真实 smoke，不再原样重跑。评审后的修复只复核受影响 diff/测试。通过后可交付 R0A 修复，不需等待证据入库或 iOS/清理/性能全部关闭。
- [ ] Step 2：检查当前 HEAD 与 source ancestry、迁移及 Edge tree。旧证据若仍有效且来源祖先/部署字节一致，可按 validator 复用；超过 `2026-09-06T17:27:06.285Z` 则取得新 correctness evidence。不要手改时钟或文件。

在当前 bootstrap 分支以只读查询取得最近一次成功 push correctness 的实际标识，再检查其 source SHA、产物与新鲜度；查询不到则不得继续。main 集成后的 refresh 使用 runbook 的 main 流程，不套用此 bootstrap 查询。

```powershell
$gateRuns = @(gh run list --workflow hosted-gate-2b.yml --branch codex/hosted-gate-2b --event push --status success --limit 1 --json databaseId | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $gateRuns.Count -ne 1) { throw 'successful_correctness_run_missing' }
$gateRunId = $gateRuns[0].databaseId
$gateRunMetadata = gh api "repos/ZP151/anicare/actions/runs/$gateRunId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $gateRunMetadata.conclusion -ne 'success') { throw 'correctness_run_invalid' }
$gateRunAttempt = $gateRunMetadata.run_attempt
$gateRunMetadata | Select-Object id, run_attempt, head_sha, event, conclusion
```
- [ ] Step 3：在实施范围包括证据入库时执行现有命令：

```powershell
pnpm promote:pilot-gate-2b-evidence -- $gateRunId $gateRunAttempt
if ($LASTEXITCODE -ne 0) { throw 'gate_2b_promotion_failed' }
pnpm --filter @animalhelper/mobile validate:gate-2b-readiness
if ($LASTEXITCODE -ne 0) { throw 'gate_2b_readiness_invalid' }
git diff --check
```

RUN_ID 必须与 Step 2 实际选择一致。只在两命令成功后精确提交生成文件；任何失败都保留 fail-closed 状态，并记录固定错误分类。若诊断需要详细 stderr，仅在受控只读 adapter 查看，不进入标准产物。
- [x] Step 4：在同一交付记录注明 R0A 修复与真实 smoke 结果、证据是否提升、R0B/R0C 未完成边界。无需追加一次完整项目审计；PR #5 不因本计划完成就等于 ready-to-merge，真机候选不自动放行，R2a 功能开发也不等待这些发布状态。

## 附录：R0B 可执行诊断任务（不是未经验证的依赖修复）

在 PR #4 的独立工作树实施，检查它的实际 SHA 和用户修改。修改候选文件：`.github/workflows/ios-device-lab.yml` 的 compile-probe 诊断步骤、`apps/mobile/scripts/build-unsigned-ios.sh` 的工具链校验；对应 `scripts/ios-device-lab-workflow-contract.test.mjs` 随确定方案更新。

在无生产凭据的 PR compile 环境收集下列命令输出：

```bash
command -v ruby
command -v gem
command -v pod
ruby -rrbconfig -e 'puts RUBY_VERSION; puts RbConfig.ruby; puts Gem.dir; puts Gem.path'
head -n 1 "$(command -v pod)"
pod _1.17.0_ env
```

比较 workflow 声明的 3.3.12 与实际 pod 报告。若 pod 仍使用 Homebrew Ruby，优先在指定 Ruby 环境内安装/锁定 CocoaPods 和完整 Gem 依赖，并通过同一解释器调用；是否采用 Bundler 由实际 Gem/toolchain 结果确定。完整 lock 必须由该 runtime 生成和评审，不能凭空填写版本。

退出诊断条件：拿到可复核的解释器/依赖路径事实，并形成一个最小可测试修复 diff。若统一运行时后仍出现 null-byte，转而对具体 pod source path/realpath/符号链接做定点归因；不得把无证据升级或自动重试写入计划。最终验收需要 frozen Podfile.lock 安装和完整 pr_compile 都通过。Windows 上的脚本测试不能代替 macOS 编译。

## 计划自检

P1-01 → Task 1/2/4；P2-03 与同 job 重复检查 → Task 3。P1-02 → R0B 诊断附录。迟到清理/墙钟 deadline、性能区域/失败计数、原子 evidence/marker 偏差按路线 R0 表各自的触发条件处理；不捆绑为功能开发前置。R2a 已有代码入口、范围与行为验收，可直接在切片内细化接口并实施，不等待 R0 或全页设计批准。


## 2026-09-08 M5 本地执行记录

Task 1 修正 issuer 排除并保留原身份约束；定向评审额外发现并修正 acquisition 对 JSON 内 sourceCommit/runId/attempt 的绑定缺口，三个错误值均拒绝并清理临时目录。Task 2 的薄 CLI 已交付，缺参返回固定错误且非零；真实产物检查显示最新成功 push run 33784288981 的 artifact 已 expired，未反复下载，真实 smoke 和错误 SHA 的实网对照仍待新产物。Task 3 补齐本地 source inventory，沿用已去重 CI。Task 4 一次最终独立 diff 评审及修复复查通过。

本地定向 21 项通过。未 commit/push、未生成/提升 evidence、未合并、未 dispatch device_candidate；旧 readiness 仍过期，不声称完整 R0A 实网验收或 M5 安装资格。最终根验证和环境结果见 [本批交付](../../reviews/2026-09-08-m3-m4-a0-m5-delivery.md)。
