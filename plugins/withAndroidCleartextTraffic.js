const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function withAndroidCleartextTraffic(config) {
  config = withAndroidManifest(config, (mod) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);

    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(xmlPath, NETWORK_SECURITY_CONFIG, 'utf8');

      return mod;
    },
  ]);

  return config;
}

module.exports = withAndroidCleartextTraffic;
