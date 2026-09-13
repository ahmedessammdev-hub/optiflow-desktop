import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import type { Command, ResultMap } from "../../../packages/shared/contracts";
import type { Settings, Session } from "../../../packages/shared/schemas";
import { defaultSettings } from "../../../packages/shared/defaults";
export const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000 } },
});
export const api = <C extends Command>(command: C, input?: unknown) =>
  window.optical.invoke(command, input);
export function useData<C extends Command>(
  command: C,
  input?: unknown,
  enabled = true,
) {
  return useQuery<ResultMap[C]>({
    queryKey: [command, input],
    queryFn: () => api(command, input),
    enabled,
  });
}
export function useDebounce(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 200);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
type Context = {
  settings: Settings;
  user: Session;
  t: (en: string, ar: string) => string;
  can: (p: string) => boolean;
  notify: (message: string) => void;
  run: <T>(
    action: () => Promise<T>,
    success?: string,
  ) => Promise<T | undefined>;
};
const AppContext = createContext<Context | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("App context missing");
  return context;
}
export function AppProvider({
  user,
  children,
}: {
  user: Session;
  children: ReactNode;
}) {
  const settings = useData("settings.get");
  const [message, setMessage] = useState("");
  const value = settings.data ?? defaultSettings;
  useEffect(() => {
    document.documentElement.dir = value.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = value.language;
  }, [value.language]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(timer);
  }, [message]);
  async function run<T>(action: () => Promise<T>, success?: string) {
    try {
      const result = await action();
      await client.invalidateQueries();
      if (success) setMessage(success);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }
  return (
    <AppContext.Provider
      value={{
        settings: value,
        user,
        t: (en, ar) => (value.language === "ar" ? ar : en),
        can: (p) => user.permissions.includes(p),
        notify: setMessage,
        run,
      }}
    >
      {children}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="Close">
            ×
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
