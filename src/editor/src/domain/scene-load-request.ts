export interface SceneLoadRequestDecision {
  sequence: number;
  skip: boolean;
}

/**
 * Advance the request sequence even for a same-document no-op. This lets a
 * user reselect the active document to cancel an older pending navigation.
 */
export function beginSceneLoadRequest(
  sequence: number,
  requestedPath: string,
  currentPath: string,
  reloadCurrent: boolean,
): SceneLoadRequestDecision {
  return {
    sequence: sequence + 1,
    skip: requestedPath === currentPath && !reloadCurrent,
  };
}
