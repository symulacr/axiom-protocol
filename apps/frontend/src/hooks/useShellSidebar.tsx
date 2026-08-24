import { createContext, useContext, type ReactNode } from "react";

/** Shell sidebar bridge — lets inner pages (chat) open the shell drawer (≤800px); App provides the value. */
interface ShellSidebarValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const ShellSidebarContext = createContext<ShellSidebarValue>({
  open: false,
  setOpen: () => void 0,
});

export function ShellSidebarProvider({
  value,
  children,
}: {
  value: ShellSidebarValue;
  children: ReactNode;
}): ReactNode {
  return (
    <ShellSidebarContext.Provider value={value}>
      {children}
    </ShellSidebarContext.Provider>
  );
}

export function useShellSidebar(): ShellSidebarValue {
  return useContext(ShellSidebarContext);
}
