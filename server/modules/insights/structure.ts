import type {
  FileTypeStat,
  RepoStructure,
  RepoTreeNode,
} from '../../../shared/types.js';

export type RawTreeEntry = {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
  sha?: string;
};

const MAX_DEPTH = 4;
const MAX_ENTRIES = 500;
const IGNORED_FILE_TYPES = new Set([
  '(none)',
  '.example',
  '.sample',
  '.template',
  '.tmpl',
  '.dist',
  '.bak',
  '.tmp',
  '.temp',
  '.log',
  '.lock',
  '.map',
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function depth(path: string): number {
  return path.split('/').length;
}

function extension(path: string): string {
  const name = path.split('/').pop() ?? path;
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return '(none)';
  return name.slice(index).toLowerCase();
}

export function buildRepoStructure(
  entries: RawTreeEntry[],
  lastModifiedByPath: Record<string, string> = {},
  sourceTruncated = false,
): RepoStructure {
  const filtered = entries
    .filter(
      (entry) =>
        (entry.type === 'blob' || entry.type === 'tree') &&
        depth(entry.path) <= MAX_DEPTH,
    )
    .sort(
      (a, b) =>
        depth(a.path) - depth(b.path) ||
        a.path.localeCompare(b.path),
    );

  const capped = filtered.slice(0, MAX_ENTRIES);
  const truncated = sourceTruncated || filtered.length > capped.length;
  const nodes = new Map<string, RepoTreeNode>();

  for (const entry of capped) {
    const isFile = entry.type === 'blob';
    const name = entry.path.split('/').pop() ?? entry.path;
    nodes.set(entry.path, {
      name,
      path: entry.path,
      type: isFile ? 'file' : 'dir',
      size: isFile ? (entry.size ?? 0) : 0,
      lastModified: isFile ? (lastModifiedByPath[entry.path] ?? null) : null,
      ...(isFile ? {} : { children: [] }),
    });
  }

  const roots: RepoTreeNode[] = [];
  for (const [path, node] of nodes) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
      roots.push(node);
      continue;
    }
    const parentPath = path.slice(0, lastSlash);
    const parent = nodes.get(parentPath);
    if (parent?.children) parent.children.push(node);
  }

  function finalize(node: RepoTreeNode): {
    files: number;
    directories: number;
    size: number;
  } {
    if (node.type === 'file') {
      return { files: 1, directories: 0, size: node.size };
    }
    let files = 0;
    let directories = 0;
    let size = 0;
    node.children?.sort(
      (a, b) =>
        Number(b.type === 'dir') - Number(a.type === 'dir') ||
        a.name.localeCompare(b.name),
    );
    for (const child of node.children ?? []) {
      const stats = finalize(child);
      files += stats.files;
      directories += stats.directories;
      size += stats.size;
    }
    node.size = size;
    node.fileCount = files;
    return { files, directories: directories + 1, size };
  }

  roots.sort(
    (a, b) =>
      Number(b.type === 'dir') - Number(a.type === 'dir') ||
      a.name.localeCompare(b.name),
  );

  let fileCount = 0;
  let directoryCount = 0;
  let totalSize = 0;
  for (const root of roots) {
    const stats = finalize(root);
    fileCount += stats.files;
    directoryCount += stats.directories;
    totalSize += stats.size;
  }

  const typeTotals = new Map<string, { count: number; sizeBytes: number }>();
  for (const node of nodes.values()) {
    if (node.type !== 'file') continue;
    const ext = extension(node.path);
    if (IGNORED_FILE_TYPES.has(ext)) continue;
    const current = typeTotals.get(ext) ?? { count: 0, sizeBytes: 0 };
    current.count += 1;
    current.sizeBytes += node.size;
    typeTotals.set(ext, current);
  }

  const fileTypes: FileTypeStat[] = [...typeTotals.entries()]
    .map(([ext, value]) => ({
      extension: ext,
      count: value.count,
      sizeBytes: value.sizeBytes,
    }))
    .sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension));

  return {
    fileCount,
    directoryCount,
    totalSize: round2(totalSize),
    truncated,
    fileTypes,
    tree: roots,
  };
}
