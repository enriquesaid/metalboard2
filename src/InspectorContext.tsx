import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

const InspectorContext = createContext<{
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
} | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <InspectorContext.Provider value={{ open, setOpen }}>{children}</InspectorContext.Provider>;
}

export function useInspector() {
  const state = useContext(InspectorContext);
  if (!state) throw new Error("InspectorProvider is required");
  return state;
}
