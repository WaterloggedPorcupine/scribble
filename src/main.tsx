import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/mona-sans/wght.css'
import '@fontsource/literata/400.css'
import '@fontsource/literata/400-italic.css'
import '@fontsource/literata/600.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/courier-prime/700.css'
import './styles/themes.css'
import './styles/app.css'
import './styles/editor.css'
import { App } from './App'
import { consumeRedirect, maybeSilentRenew } from './lib/google/auth'
import { getPrefs } from './lib/prefs'

// Finish a Google sign-in before the router reads the URL.
const redirect = consumeRedirect()

// Ask the browser not to clear Scribble's storage when space runs low.
void navigator.storage?.persist?.()

const renewing = !redirect && maybeSilentRenew(getPrefs().autoReconnect)

if (!renewing) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App authError={redirect?.error} />
    </StrictMode>,
  )
}
