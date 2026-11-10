export function getConfirmToken() {
  return new URLSearchParams(window.location.search).get("confirm-email");
}

export function clearConfirmFromUrl() {
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
}