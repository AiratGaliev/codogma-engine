interface EditorMcpCommand {
  id: string;
  clientId: string;
  tool: string;
  args?: Record<string, unknown>;
}

export type EditorMcpHandler = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

type EditorMcpBridgeStatus = "connecting" | "connected" | "disconnected";

export interface EditorMcpBridgeOptions {
  onFilesChanged?: () => void | Promise<void>;
  onStatus?: (status: EditorMcpBridgeStatus, message?: string) => void;
  onError?: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readCommand(value: unknown): EditorMcpCommand | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.clientId !== "string" ||
    typeof value.tool !== "string" ||
    (value.args !== undefined && !isRecord(value.args))
  ) {
    return null;
  }

  return {
    id: value.id,
    clientId: value.clientId,
    tool: value.tool,
    args: (value.args as Record<string, unknown> | undefined) ?? {},
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects this browser Host to the engine-owned MCP registry. The server
 * issues the session id in the SSE "connected" event; callers never choose
 * their own identity and every command result is bound to that session.
 */
export function connectEditorMcpBridge(
  handlers: Record<string, EditorMcpHandler>,
  options: EditorMcpBridgeOptions = {},
): () => void {
  let clientId: string | null = null;
  let disposed = false;

  const source = new EventSource("/editor/mcp-bridge/events");

  const reportError = (error: unknown) => {
    const message = errorMessage(error);
    options.onError?.(message);
    options.onStatus?.("disconnected", message);
  };

  const postResult = async (
    command: EditorMcpCommand,
    result: unknown,
  ) => {
    const response = await fetch("/editor/mcp-bridge/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        id: command.id,
        clientId: command.clientId,
        result,
      }),
    });

    if (!response.ok) {
      throw new Error(`Editor MCP command result was rejected (${response.status}).`);
    }

    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.error === "string") {
      throw new Error(payload.error);
    }
  };

  const handleCommand = async (event: Event) => {
    let value: unknown;
    try {
      value = JSON.parse((event as MessageEvent<string>).data);
    } catch {
      reportError(new Error("The MCP server sent an invalid command event."));
      return;
    }

    const command = readCommand(value);
    if (!command || command.clientId !== clientId) return;

    try {
      const handler = handlers[command.tool];
      if (!handler) {
        throw new Error(`The Editor Host does not implement "${command.tool}".`);
      }
      const result = await handler(command.args ?? {});
      await postResult(command, result);
    } catch (error) {
      try {
        await postResult(command, { __error: errorMessage(error) });
      } catch (postError) {
        reportError(postError);
      }
    }
  };

  source.addEventListener("connected", (event) => {
    try {
      const payload: unknown = JSON.parse((event as MessageEvent<string>).data);
      if (!isRecord(payload) || typeof payload.clientId !== "string") {
        throw new Error("The MCP server returned an invalid editor session.");
      }
      clientId = payload.clientId;
      options.onStatus?.("connected");
    } catch (error) {
      reportError(error);
    }
  });

  source.addEventListener("command", (event) => {
    void handleCommand(event);
  });

  source.addEventListener("files-changed", () => {
    void Promise.resolve(options.onFilesChanged?.()).catch(reportError);
  });

  source.onopen = () => {
    if (clientId) options.onStatus?.("connected");
  };

  source.onerror = () => {
    // EventSource reconnects automatically; the next "connected" event
    // establishes a fresh server-owned session id.
    clientId = null;
    options.onStatus?.("connecting");
  };

  options.onStatus?.("connecting");

  return () => {
    if (disposed) return;
    disposed = true;
    clientId = null;
    source.close();
    options.onStatus?.("disconnected");
  };
}
