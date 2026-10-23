export type ToastKind = "success" | "error";
export type ToastItem = { id: number; text: string; kind: ToastKind };

let listener: ((t: ToastItem) => void) | null = null;
let nextId = 1;

export function onToast(l: ((t: ToastItem) => void) | null) {
  listener = l;
}

export function showToast(text: string, kind: ToastKind = "success") {
  listener?.({ id: nextId++, text, kind });
}