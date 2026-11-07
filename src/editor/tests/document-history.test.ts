import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import {
  createDocumentHistoryState,
  recordDocumentChange,
  undoDocumentChange,
  redoDocumentChange,
  resolveDocumentChangeRollback,
} from "../src/domain/document-history.js";

testCase("undo and redo restore document snapshots and exact selection including null", () => {
  const first = { id: "scene", nodes: ["player", "enemy"] };
  const second = { id: "scene", nodes: ["player"] };
  let history = createDocumentHistoryState(first);

  history = recordDocumentChange(history, second, "enemy", null);
  const undone = undoDocumentChange(history);
  assert.ok(undone);
  assert.equal(undone.document, first);
  assert.equal(undone.selectedId, "enemy");
  assert.equal(undone.state.index, 0);

  const redone = redoDocumentChange(undone.state);
  assert.ok(redone);
  assert.equal(redone.document, second);
  assert.equal(redone.selectedId, null);
  assert.equal(redone.state.index, 1);
  assert.equal(undoDocumentChange(createDocumentHistoryState(first)), null);
  assert.equal(redoDocumentChange(history), null);
});

testCase("a new edit after undo discards the old redo branch and its selection transition", () => {
  const first = { value: 0 };
  const second = { value: 1 };
  const branch = { value: 2 };
  let history = createDocumentHistoryState(first);
  history = recordDocumentChange(history, second, "a", "b");
  const undone = undoDocumentChange(history);
  assert.ok(undone);
  history = recordDocumentChange(undone.state, branch, "a", null);

  assert.deepEqual(history.documents, [first, branch]);
  assert.deepEqual(history.selectionChanges, [{ before: "a", after: null }]);
  assert.equal(history.index, 1);
  assert.equal(redoDocumentChange(history), null);
});

testCase("history remains bounded while undo and redo selection transitions stay aligned", () => {
  let history = createDocumentHistoryState(0);
  for (let value = 1; value <= 105; value += 1) {
    history = recordDocumentChange(history, value, String(value - 1), String(value));
  }

  assert.equal(history.documents.length, 100);
  assert.equal(history.selectionChanges.length, 99);
  assert.equal(history.documents[0], 6);
  assert.equal(history.documents.at(-1), 105);
  assert.equal(undoDocumentChange(history)?.selectedId, "104");
});

testCase("failed asynchronous saves only roll back their own unchanged document snapshot", () => {
  const first = { id: "scene", value: 0 };
  const committed = { id: "scene", value: 1 };
  const laterEdit = { id: "scene", value: 2 };
  const previousState = createDocumentHistoryState(first);
  const committedState = recordDocumentChange(previousState, committed, null, "node-1");
  const rollback = {
    previousDocument: first,
    previousState,
    previousSelection: null,
    committedDocument: committed,
    committedState,
  };

  const exactRollback = resolveDocumentChangeRollback(committed, committedState, rollback);
  assert.ok(exactRollback);
  assert.equal(exactRollback.document, first);
  assert.equal(exactRollback.state, previousState);
  assert.equal(exactRollback.selectedId, null);

  const laterState = recordDocumentChange(committedState, laterEdit, "node-1", "node-2");
  assert.equal(resolveDocumentChangeRollback(laterEdit, laterState, rollback), null);
  assert.equal(resolveDocumentChangeRollback(first, committedState, rollback), null);
});

