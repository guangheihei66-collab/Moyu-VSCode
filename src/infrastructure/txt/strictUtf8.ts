function continuation(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

function validateUtf8(
  bytes: Uint8Array,
  allowIncompleteTail: boolean,
): boolean {
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index]!;
    if (first <= 0x7f) continue;
    if (first >= 0xc2 && first <= 0xdf) {
      if (index + 1 >= bytes.length) return allowIncompleteTail;
      if (!continuation(bytes[index + 1]!)) return false;
      index += 1;
      continue;
    }
    if (first === 0xe0) {
      if (index + 2 >= bytes.length) return allowIncompleteTail;
      if (
        bytes[index + 1]! < 0xa0 ||
        bytes[index + 1]! > 0xbf ||
        !continuation(bytes[index + 2]!)
      )
        return false;
      index += 2;
      continue;
    }
    if ((first >= 0xe1 && first <= 0xec) || (first >= 0xee && first <= 0xef)) {
      if (index + 2 >= bytes.length) return allowIncompleteTail;
      if (!continuation(bytes[index + 1]!) || !continuation(bytes[index + 2]!))
        return false;
      index += 2;
      continue;
    }
    if (first === 0xed) {
      if (index + 2 >= bytes.length) return allowIncompleteTail;
      if (
        bytes[index + 1]! < 0x80 ||
        bytes[index + 1]! > 0x9f ||
        !continuation(bytes[index + 2]!)
      )
        return false;
      index += 2;
      continue;
    }
    if (first === 0xf0) {
      if (index + 3 >= bytes.length) return allowIncompleteTail;
      if (
        bytes[index + 1]! < 0x90 ||
        bytes[index + 1]! > 0xbf ||
        !continuation(bytes[index + 2]!) ||
        !continuation(bytes[index + 3]!)
      )
        return false;
      index += 3;
      continue;
    }
    if (first >= 0xf1 && first <= 0xf3) {
      if (index + 3 >= bytes.length) return allowIncompleteTail;
      if (
        !continuation(bytes[index + 1]!) ||
        !continuation(bytes[index + 2]!) ||
        !continuation(bytes[index + 3]!)
      )
        return false;
      index += 3;
      continue;
    }
    if (first === 0xf4) {
      if (index + 3 >= bytes.length) return allowIncompleteTail;
      if (
        bytes[index + 1]! < 0x80 ||
        bytes[index + 1]! > 0x8f ||
        !continuation(bytes[index + 2]!) ||
        !continuation(bytes[index + 3]!)
      )
        return false;
      index += 3;
      continue;
    }
    return false;
  }
  return true;
}

export function isStrictUtf8(bytes: Uint8Array): boolean {
  return validateUtf8(bytes, false);
}

export function isStrictUtf8Prefix(bytes: Uint8Array): boolean {
  return validateUtf8(bytes, true);
}
