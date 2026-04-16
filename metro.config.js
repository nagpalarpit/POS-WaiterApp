// Node 18 lacks Array.prototype.toReversed, but metro-config relies on it.
// Polyfill here to keep Expo/Metro config loading on older Node versions.
if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, 'toReversed', {
    value: function toReversed() {
      return [...this].reverse();
    },
    writable: true,
    configurable: true,
  });
}

const { getDefaultConfig } = require('expo/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withSentryConfig(withNativeWind(config, {
  input: './src/styles/tailwind.css',
}));
