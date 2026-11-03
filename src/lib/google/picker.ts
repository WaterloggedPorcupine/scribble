import { AuthError, GOOGLE_API_KEY, GOOGLE_APP_ID, getToken } from './auth'
import { MIME } from './drive'

export interface PickedFile {
  id: string
  name: string
  mimeType: string
}

declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

let pickerReady: Promise<void> | null = null

function loadPicker(): Promise<void> {
  pickerReady ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Picker failed to load')) })
    script.onerror = () => {
      pickerReady = null
      reject(new Error('Could not reach Google. Check your connection.'))
    }
    document.head.appendChild(script)
  })
  return pickerReady
}

/** Opens Google's own file picker. Scribble only gets access to the files you choose. */
export async function pickDriveFiles(): Promise<PickedFile[]> {
  const token = getToken()
  if (!token) throw new AuthError()
  await loadPicker()
  const { picker } = window.google
  return new Promise((resolve) => {
    const docs = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes([MIME.gdoc, MIME.docx, MIME.txt, MIME.md].join(','))
      .setIncludeFolders(true)
      .setMode(picker.DocsViewMode.LIST)
    const built = new picker.PickerBuilder()
      .addView(docs)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .setTitle('Choose stories to import')
      .setCallback((data: any) => {
        if (data.action === picker.Action.PICKED) {
          resolve((data.docs as any[]).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })))
        } else if (data.action === picker.Action.CANCEL) {
          resolve([])
        }
      })
      .build()
    built.setVisible(true)
  })
}
