export interface FocusAnchor {
  blockId: string;
  characterOffset: number;
  paragraphIndex?: number;
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
  const paragraphIndex = Number(element.dataset.readerParagraphIndex);
  return {
    blockId: element.dataset.blockId,
    characterOffset: 0,
    ...(Number.isSafeInteger(paragraphIndex) && paragraphIndex >= 0
      ? { paragraphIndex }
      : {}),
  };
}

export function restoreFocusAnchor(
  root: HTMLElement,
  anchor: FocusAnchor,
): boolean {
  const element = Array.from(
    root.querySelectorAll<HTMLElement>('[data-block-id]'),
  ).find(
    (candidate) =>
      candidate.dataset.blockId === anchor.blockId &&
      (anchor.paragraphIndex === undefined ||
        candidate.dataset.readerParagraphIndex ===
          String(anchor.paragraphIndex)),
  );
  if (element === undefined) return false;
  element.focus({ preventScroll: true });
  return true;
}
