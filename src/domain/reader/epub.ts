export interface EpubChapter {
  id: string;
  title: string;
  paragraphs: string[];
  contentFingerprint: string;
}

export interface EpubBookIndex {
  schemaVersion: 1;
  sourceFingerprint: string;
  chapters: EpubChapter[];
}
