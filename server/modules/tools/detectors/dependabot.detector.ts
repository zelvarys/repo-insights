import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';
import { computeAdoptionRate } from './adoption.js';

export const dependabotDetector: ToolDetector = {
  name: 'dependabot',
  category: 'dependencies',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    if ('.github/dependabot.yml' in ctx.configFiles || '.github/dependabot.yaml' in ctx.configFiles) {
      detected = true;
      evidence.configFiles = [
        '.github/dependabot.yml',
        '.github/dependabot.yaml',
      ].filter((f) => f in ctx.configFiles);
    }

    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    if (detected) {
      // Approximate usage: any commit that touched a lockfile / manifest in the
      // window indicates the contributor is landing changes Dependabot would
      // then manage — a proxy for participation in dependency automation.
      const DEP_FILE_RE =
        /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|pyproject\.toml|go\.mod|go\.sum|Gemfile|Gemfile\.lock|composer\.json|composer\.lock)$/;
      for (const commit of ctx.commits) {
        if (!commit.authorLogin) continue;
        if (commit.files.some((f) => DEP_FILE_RE.test(f.filename))) {
          perContributor[commit.authorLogin] = true;
        }
      }
    }

    const adoptionRate = computeAdoptionRate(
      ctx.contributors.map((c) => c.login),
      perContributor,
      detected,
    );

    return {
      tool: 'dependabot',
      category: 'dependencies',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};