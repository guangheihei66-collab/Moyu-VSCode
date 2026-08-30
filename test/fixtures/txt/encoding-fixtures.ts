import * as iconv from 'iconv-lite';

export const utf8Bom = Uint8Array.from([
  0xef,
  0xbb,
  0xbf,
  ...Buffer.from('你好', 'utf8'),
]);
export const validUtf8 = Uint8Array.from(Buffer.from('hello 世界', 'utf8'));
export const invalidUtf8 = Uint8Array.from([0xc3, 0x28, 0xff]);
export const utf16le = Uint8Array.from(iconv.encode('你好', 'utf16le'));
export const utf16be = Uint8Array.from(iconv.encode('你好', 'utf16be'));
export const gb18030 = Uint8Array.from(iconv.encode('你好', 'gb18030'));
export const gbk = Uint8Array.from(iconv.encode('你好', 'gbk'));
