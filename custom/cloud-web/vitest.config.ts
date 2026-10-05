/** Owner-local assembled browser lane; leaves upstream test configuration intact. */
import { defineConfig } from 'vitest/config'
import upstream from '../../vitest.web.config.ts'

export default defineConfig({
  ...upstream,
  test: { ...upstream.test, include: ['custom/cloud-web/tests/mobile.e2e.ts'] },
})
