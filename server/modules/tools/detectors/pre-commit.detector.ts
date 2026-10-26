import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';
import { computeAdoptionRate } from './adoption.js';

const SOURCE_FILE_RE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|php|rs|java|kt|cs|md|yaml|yml|json)$/;

export const preCommitDetector: ToolDetector = {
  name: 'pre-commit',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const preCommitConfig = ctx.configFiles['.pre-commit-config.yaml'];
    if (preCommitConfig) {
      detected = true;
      evidence.configFiles = ['.pre-commit-config.yaml'];
    }

    // CI runs pre-commit
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bpre-commit\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // Per-contributor: touched source files
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touched = commit.files.some((f) => SOURCE_FILE_RE.test(f.filename));
      if (touched) perContributor[commit.authorLogin] = true;
    }

    const adoptionRate = computeAdoptionRate(
      ctx.contributors.map((c) => c.login),
      perContributor,
      detected,
    );

    return {
      tool: 'pre-commit',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};