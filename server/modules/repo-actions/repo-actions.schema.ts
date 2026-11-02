export type CreateIssueInput = {
  title: string;
  body: string;
};

export type CreateCodespaceInput = {
  ref?: string;
};

export function parseRunId(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('Invalid workflow run id');
  }
  const runId = Number(value);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error('Invalid workflow run id');
  }
  return runId;
}

export function parseCreateIssueBody(body: unknown): CreateIssueInput {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }
  const input = body as Record<string, unknown>;
  if (typeof input.title !== 'string') {
    throw new Error('title is required');
  }
  const title = input.title.trim();
  if (title.length === 0 || title.length > 256) {
    throw new Error('title must be between 1 and 256 characters');
  }
  if (input.body !== undefined && typeof input.body !== 'string') {
    throw new Error('body must be a string');
  }
  const issueBody = typeof input.body === 'string' ? input.body : '';
  if (issueBody.length > 65_536) {
    throw new Error('body must be at most 65536 characters');
  }
  return { title, body: issueBody };
}

export function parseCreateCodespaceBody(
  body: unknown,
): CreateCodespaceInput {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object');
  }
  const ref = (body as Record<string, unknown>).ref;
  if (ref === undefined) return {};
  if (typeof ref !== 'string') throw new Error('ref must be a string');
  const trimmed = ref.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new Error('ref must be between 1 and 255 characters');
  }
  return { ref: trimmed };
}
