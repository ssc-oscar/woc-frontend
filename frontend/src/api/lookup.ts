import { request } from './request.ts';

export type ObjectName = 'blob' | 'commit' | 'tree';

type LookupGitObject = {
  hash: string;
};
type LookupNamedObject = {
  name: string;
};

export type LookupCommit = LookupGitObject & {
  tree: string;
  parent: string;
  author: string;
  authored_at: Date;
  committer: string;
  committed_at: Date;
  message: string;
};

export type LookupAuthor = LookupNamedObject & {
  author_name: string;
  email: string;
};

export type LookupFile = LookupGitObject &
  LookupNamedObject & {
    mode: string;
  };

export type LookupTree = LookupFile & {
  entries: Array<LookupFile | LookupTree> | undefined;
};

export const getCommit = async (key: string): Promise<LookupCommit> => {
  const [
    tree,
    parent,
    [author, author_timestamp, author_timezone],
    [committer, committer_timestamp, committer_timezone],
    message
  ] = await request<
    [string, string, [string, string, string], [string, string, string], string]
  >(`/lookup/object/commit/${key}`, 'GET');
  return {
    hash: key,
    tree,
    parent,
    author,
    authored_at: new Date(parseInt(author_timestamp) * 1000),
    committer,
    committed_at: new Date(parseInt(committer_timestamp) * 1000),
    message
  };
};

export const getBlob = async (key: string): Promise<string> =>
  await request<string>(`/lookup/object/blob/${key}`, 'GET');

export const getObjectCount = async (object: ObjectName): Promise<number> =>
  await request<number>(`/lookup/object/${object}/count`, 'GET');

type RawTreeEntry = Array<[string, string, string | RawTreeEntry]>;
const decodeTreeEntry = (
  name: string,
  hash: string,
  entry: RawTreeEntry
): LookupTree => {
  const _tree: LookupTree = {
    mode: '40000',
    hash,
    name,
    entries: []
  };
  for (const [mode, name, hashOrTree] of entry) {
    if (mode != '40000' && typeof hashOrTree === 'string') {
      // a file, a submodule, or an unexplored tree
      _tree.entries?.push({
        mode,
        hash: hashOrTree,
        name
      });
    } else if (mode == '40000' && Array.isArray(hashOrTree)) {
      // an explored tree
      _tree.entries?.push(decodeTreeEntry(name, hash, hashOrTree));
    }
    // shall never happen
    console.assert(
      false,
      `Invalid tree entry${JSON.stringify([mode, name, hashOrTree])}`
    );
  }
  return _tree;
};

export const getTree = async (
  key: string,
  traverse: boolean
): Promise<LookupTree> => {
  const resp = await request<RawTreeEntry>(
    `/lookup/object/tree/${key}`,
    'GET',
    { traverse }
  );
  return decodeTreeEntry('', key, resp);
};

export const getValue = async <T>(map: string, key: string): Promise<T> => {
  const resp = await request<T>(`/lookup/map/${map}/${key}`, 'GET');
  return resp;
};

export const getValues = async <T>(
  map: string,
  keys: string[]
): Promise<Record<string, T>> => {
  const params = new URLSearchParams();
  keys.forEach((k) => params.append('q', k));
  const resp = await request<Record<string, T>>(
    `/lookup/map/${map}`,
    'GET',
    params
  );
  return resp;
};

export const getMapNames = async (): Promise<string[]> => {
  const resp = await request<{ name: string }[]>('/lookup/map', 'GET');
  return Array.from(new Set<string>(resp.map((m) => m.name)));
};

export const getMapCount = async (map: string): Promise<number> => {
  const resp = await request<number>(`/lookup/map/${map}/count`, 'GET');
  return resp;
};
