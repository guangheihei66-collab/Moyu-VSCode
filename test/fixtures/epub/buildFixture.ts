import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';

interface FixtureEntry {
  name: string;
  text: string;
}

export async function buildFixture(
  entries: readonly FixtureEntry[],
): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const entry of entries) {
    await writer.add(entry.name, new TextReader(entry.text));
  }
  return writer.close();
}
