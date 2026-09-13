import { contextBridge, ipcRenderer } from "electron";
import type {
  Command,
  DesktopAPI,
  ResultMap,
} from "../../../packages/shared/contracts";
const api: DesktopAPI = {
  async invoke<C extends Command>(
    command: C,
    input?: unknown,
  ): Promise<ResultMap[C]> {
    const result = await ipcRenderer.invoke("optical:command", command, input);
    if (!result.ok) throw new Error(result.error);
    return result.data as ResultMap[C];
  },
};
contextBridge.exposeInMainWorld("optical", Object.freeze(api));
