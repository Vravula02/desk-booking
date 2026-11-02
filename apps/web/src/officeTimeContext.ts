import { createContext, useContext } from "react";

export const OfficeTimeContext = createContext<string>(
  Intl.DateTimeFormat().resolvedOptions().timeZone
);

export function useOfficeTz(): string {
  return useContext(OfficeTimeContext);
}