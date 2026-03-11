import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const opnetProviderPatch = () => ({
  name: 'opnet-provider-patch',
  transform(code: string, id: string) {
    if (!id.includes('opnet')) return null
    if (!code.includes('providerUrl')) return null
    const patched = code.replace(
      /providerUrl\(e\)\{return e=e\.trim\(\),/g,
      `providerUrl(e){e=e||"https://testnet.opnet.org";return e=e.trim(),`
    )
    if (patched !== code) return { code: patched, map: null }
    return null
  }
})

export default defineConfig({
  plugins: [react(), opnetProviderPatch()],
  root: 'client',
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
})
