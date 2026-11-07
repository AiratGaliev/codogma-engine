export interface DocumentSelectionChange {
  before: string | null;
  after: string | null;
}

export interface DocumentHistoryState<T> {
  documents: T[];
  selectionChanges: DocumentSelectionChange[];
  index: number;
}

export interface DocumentHistoryStep<T> {
  state: DocumentHistoryState<T>;
  document: T;
  selectedId: string | null;
}

const MAX_DOCUMENT_HISTORY = 100;

export function createDocumentHistoryState<T>(document: T): DocumentHistoryState<T> {
  return {
    documents: [document],
    selectionChanges: [],
    index: 0,
  };
}

export function recordDocumentChange<T>(
  state: DocumentHistoryState<T>,
  document: T,
  before: string | null,
  after: string | null,
): DocumentHistoryState<T> {
  const documents = state.documents.slice(0, state.index + 1);
  const selectionChanges = state.selectionChanges.slice(0, state.index);
  documents.push(document);
  selectionChanges.push({ before, after });

  if (documents.length > MAX_DOCUMENT_HISTORY) {
    documents.shift();
    selectionChanges.shift();
  }

  return {
    documents,
    selectionChanges,
    index: documents.length - 1,
  };
}

export function undoDocumentChange<T>(
  state: DocumentHistoryState<T>,
): DocumentHistoryStep<T> | null {
  if (state.index <= 0) return null;

  const nextIndex = state.index - 1;
  const document = state.documents[nextIndex];
  const selection = state.selectionChanges[nextIndex];
  if (document === undefined || !selection) return null;

  return {
    state: { ...state, index: nextIndex },
    document,
    selectedId: selection.before,
  };
}

export function redoDocumentChange<T>(
  state: DocumentHistoryState<T>,
): DocumentHistoryStep<T> | null {
  if (state.index >= state.documents.length - 1) return null;

  const nextIndex = state.index + 1;
  const document = state.documents[nextIndex];
  const selection = state.selectionChanges[state.index];
  if (document === undefined || !selection) return null;

  return {
    state: { ...state, index: nextIndex },
    document,
    selectedId: selection.after,
  };
}
