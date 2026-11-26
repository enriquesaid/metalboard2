import { openDB, type DBSchema } from 'idb';
import { createTLStore, getSnapshot, isEqual, loadSnapshot, TAB_ID, TLDOCUMENT_ID, type Editor, type TLAsset, type TLRecord, type TLSessionStateSnapshot, type TLStoreSnapshot } from 'tldraw';
import { saveBoardJson } from './save-board';

export const BOARD_PERSISTENCE_KEY = 'metalboard-v1';

export interface BoardFile {
  format: 'metalboard';
  version: 1;
  name: string;
  snapshot: { document: TLStoreSnapshot; session?: TLSessionStateSnapshot };
}

type BoardSnapshot = BoardFile['snapshot'] | TLStoreSnapshot;

export function parseBoardFile(json: string, editor: Editor): { name?: string; snapshot: BoardSnapshot } {
  const parsed: { format?: unknown; version?: unknown; name?: unknown; snapshot?: BoardSnapshot } | null = JSON.parse(json);
  const snapshot = parsed?.snapshot;
  if (parsed?.format !== 'metalboard' || parsed.version !== 1 || !snapshot || typeof snapshot !== 'object') {
    throw new Error('Formato de board não reconhecido.');
  }
  const savedDocument = 'document' in snapshot ? snapshot.document : snapshot;
  if (!savedDocument?.schema || !savedDocument.store?.[TLDOCUMENT_ID]) {
    throw new Error('Formato de board não reconhecido.');
  }

  // Validate record migrations away from the live editor so a bad file cannot
  // publish changes to the local store or other open tabs before being rejected.
  const validationStore = createTLStore({ schema: editor.store.schema });
  try {
    loadSnapshot(validationStore, snapshot);
  } catch {
    throw new Error('O arquivo contém dados de board inválidos ou incompatíveis.');
  } finally {
    validationStore.dispose();
  }

  return { name: typeof parsed.name === 'string' ? parsed.name : undefined, snapshot };
}

// Storage layout written by tldraw 5.4.2's LocalIndexedDb.
interface BoardDatabase extends DBSchema {
  records: { key: string; value: TLRecord };
  schema: { key: string; value: TLStoreSnapshot['schema'] };
  session_state: { key: string; value: { updatedAt: number; snapshot: TLSessionStateSnapshot } };
  assets: { key: string; value: Blob };
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function portableStore(records: TLRecord[], readAsset: (asset: TLAsset) => Promise<Blob | undefined>) {
  const entries = await Promise.all(records.map(async (record) => {
    if (record.typeName === 'asset' && record.props.src?.startsWith('asset:')) {
      const blob = await readAsset(record);
      if (!blob) throw new Error('Um anexo do board não foi encontrado no dispositivo.');
      const src = await asDataUrl(blob);
      return [record.id, { ...record, props: { ...record.props, src } }] as const;
    }
    return [record.id, record] as const;
  }));
  return Object.fromEntries(entries);
}

/** Capture the current document before awaiting local image and video data. */
export async function readOpenBoard(editor: Editor, name: string): Promise<BoardFile> {
  const { document, session } = getSnapshot(editor.store);
  const store = await portableStore(Object.values(document.store), async (asset) => {
    const url = await editor.resolveAssetUrl(asset.id, { shouldResolveToOriginal: true });
    if (!url) return undefined;
    const response = await fetch(url);
    return response.ok ? response.blob() : undefined;
  });
  return { format: 'metalboard', version: 1, name, snapshot: { document: { ...document, store }, session } };
}

function openExistingBoard() {
  let missing = false;
  return openDB<BoardDatabase>(`TLDRAW_DOCUMENT_v2${BOARD_PERSISTENCE_KEY}`, undefined, {
    upgrade(_db, oldVersion, _newVersion, transaction) {
      // Opening an absent database starts an upgrade. Abort without creating it.
      missing = oldVersion === 0;
      void transaction.done.catch(() => {});
      transaction.abort();
    },
  }).catch((error: unknown) => {
    if (missing) return null;
    throw error;
  });
}

/** Recover an importable copy even when the editor cannot mount. */
export async function readSavedBoard(name: string): Promise<BoardFile | null> {
  const db = await openExistingBoard();
  if (!db) return null;

  try {
    const tx = db.transaction(['records', 'schema', 'session_state', 'assets'], 'readonly');
    const records = tx.objectStore('records').getAll();
    const [schema, sessions, store] = await Promise.all([
      tx.objectStore('schema').get('schema'),
      tx.objectStore('session_state').getAll(),
      records.then((rows) => portableStore(rows, (asset) => tx.objectStore('assets').get(asset.id))),
      tx.done,
    ]);
    if (Object.keys(store).length === 0) return null;
    if (!schema) throw new Error('O esquema do board salvo está incompleto.');
    const document = { schema, store };
    const session = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.snapshot;
    return { format: 'metalboard', version: 1, name, snapshot: { document, session } };
  } finally {
    db.close();
  }
}

/** Returns false if the snapshot was applied but its local commit could not be confirmed. */
export async function replaceBoardSnapshot(editor: Editor, snapshot: BoardSnapshot, persist: boolean): Promise<boolean> {
  const db = persist ? await openExistingBoard() : null;
  if (persist && !db) throw new Error('O armazenamento local não está disponível.');
  try {
    if (editor.isDisposed) throw new Error('O editor foi fechado.');
    const previous = getSnapshot(editor.store);
    try {
      loadSnapshot(editor.store, snapshot);
    } catch (error) {
      loadSnapshot(editor.store, previous);
      throw error;
    }
    // The previous board remains available through the document-level restore.
    // Canvas undo must start at the newly loaded document.
    editor.clearHistory();
    if (!db) return true;
    try {
      // tldraw writes after a debounce. Only report success once its own
      // transaction has committed; the active local sync client remains the writer.
      const deadline = performance.now() + 10_000;
      do {
        const tx = db.transaction(['records', 'session_state'], 'readonly');
        const [rows, session] = await Promise.all([
          tx.objectStore('records').getAll(),
          tx.objectStore('session_state').get(TAB_ID),
          tx.done,
        ]);
        const current = getSnapshot(editor.store);
        if (rows.length === Object.keys(current.document.store).length
          && rows.every((row) => isEqual(row, current.document.store[row.id]))
          && isEqual(session?.snapshot, current.session)) return true;
        await new Promise((resolve) => setTimeout(resolve, 350));
      } while (performance.now() < deadline);
    } catch {
      // The in-memory board was already replaced. Keep its name and undo action.
    }
    return false;
  } finally {
    db?.close();
  }
}

export function downloadBoardFile(board: BoardFile) {
  return saveBoardJson(JSON.stringify(board));
}
