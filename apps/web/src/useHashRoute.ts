import { useCallback, useSyncExternalStore } from "react";

export type Route = "search" | "timeline" | "mine" | "admin" | "account";

const ROUTES: Route[] = ["search", "timeline", "mine", "admin", "account"];

function parse(): Route {
  const name = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return (ROUTES as string[]).includes(name) ? (name as Route) : "search";
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

// Returns the current route and a function to change it.
// navigate(route) adds a browser history entry (so Back works);
// navigate(route, true) replaces the current entry (used after logout).
export function useHashRoute(): [Route, (next: Route, replace?: boolean) => void] {
  const route = useSyncExternalStore(subscribe, parse, () => "search" as Route);

  const navigate = useCallback((next: Route, replace = false) => {
    const hash = `#/${next}`;
    if (window.location.hash === hash) return;
    if (replace) {
      window.history.replaceState(null, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [route, navigate];
}