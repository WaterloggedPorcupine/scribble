import { MIME, fetchDocxFromGoogleDoc, fetchFileBytes, fetchFileText } from '../google/drive'
import { pickDriveFiles, type PickedFile } from '../google/picker'
import { docxToHtml, makeDoc, markdownToHtml, textToHtml, type ImportedDoc } from './convert'

async function fileToHtml(f: PickedFile): Promise<string> {
  if (f.mimeType === MIME.gdoc) return docxToHtml(await fetchDocxFromGoogleDoc(f.id))
  if (f.mimeType === MIME.docx) return docxToHtml(await fetchFileBytes(f.id))
  const text = await fetchFileText(f.id)
  if (f.mimeType === MIME.md || /\.(md|markdown)$/i.test(f.name)) return markdownToHtml(text)
  return textToHtml(text)
}

export async function importFromDrive(onProgress?: (done: number, total: number) => void): Promise<ImportedDoc[]> {
  const files = await pickDriveFiles()
  const docs: ImportedDoc[] = []
  for (const [i, f] of files.entries()) {
    onProgress?.(i, files.length)
    docs.push(makeDoc(f.name.replace(/\.(docx|txt|md|markdown)$/i, ''), await fileToHtml(f), 'google-drive'))
  }
  return docs
}
