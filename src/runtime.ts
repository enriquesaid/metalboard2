import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export type RunEvent = {
  id: string;
  type: "output" | "completed" | "failed";
  data?: string;
  exitCode?: number;
};
export const desktopAvailable = isTauri();
export async function execute(
  command: string,
  cwd: string,
  onEvent: (event: RunEvent) => void,
) {
  if (!desktopAvailable)
    throw new Error(
      "Abra o Metalboard desktop para executar comandos no computador.",
    );
  const id = crypto.randomUUID();
  const unlisten = await listen<RunEvent>("terminal-event", ({ payload }) => {
    if (payload.id !== id) return;
    onEvent(payload);
    if (payload.type !== "output") unlisten();
  });
  try {
    await invoke("execute_command", { id, command, cwd });
  } catch (error) {
    unlisten();
    throw error;
  }
  return { cancel: () => invoke("cancel_command", { id }) };
}

export async function startTerminal(
  cwd: string,
  onEvent: (event: RunEvent) => void,
) {
  if (!desktopAvailable)
    throw new Error("Abra o Metalboard desktop para iniciar uma sessão persistente.");
  const id = crypto.randomUUID();
  const unlisten = await listen<RunEvent>("terminal-event", ({ payload }) => {
    if (payload.id === id) onEvent(payload);
  });
  try {
    await invoke("start_terminal", { id, cwd });
  } catch (error) {
    unlisten();
    throw error;
  }
  return {
    id,
    write: (input: string) => invoke("write_terminal", { id, input }),
    cancel: async () => {
      unlisten();
      await invoke("cancel_command", { id });
    },
  };
}
