import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.metadataagents.app',
  appName: 'Metadata Agents',
  webDir: 'www',
  server: {
    url: 'https://metadata-agents.vercel.app',
    cleartext: false
  }
};

export default config;