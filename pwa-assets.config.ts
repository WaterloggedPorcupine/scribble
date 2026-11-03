import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#fdf6e3' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#fdf6e3' } },
  },
  images: ['public/favicon.svg'],
})
