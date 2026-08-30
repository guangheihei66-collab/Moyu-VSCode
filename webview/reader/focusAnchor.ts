export interface FocusAnchor {
  blockId: string;
  characterOffset: number;
}

export function captureFocusAnchor(root: HTMLElement): FocusAnchor | undefined {
  const active = root.ownerDocument.activeElement;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('[data-block-id]'),
  );
  const element = candidates.find(
    (candidate) => candidate === active || candidate.contains(active),
  );
  if (element?.dataset.blockId === undefined) return undefined;
  return { blockId: element.dataset.blockId, characterOffset: 0 };
}

export function restoreFocusAnchor(
  root: HTMLElement,
  anchor: FocusAnchor,
): boolean {
  const element = Array.from(
    root.querySelectorAll<HTMLElement>('[data-block-id]'),
  ).find((candidate) => candidate.dataset.blockId === anchor.blockId);
  if (element === undefined) return false;
  element.focus({ preventScroll: true });
  return true;
}
