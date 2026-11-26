import { invoke, isTauri } from '@tauri-apps/api/core';

export async function saveBoardJson(json: string): Promise<boolean> {
  if (isTauri()) {
    const saved = await invoke<boolean | null>('save_board_json', { json });
    if (saved !== null) return saved;
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'metalboard.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
