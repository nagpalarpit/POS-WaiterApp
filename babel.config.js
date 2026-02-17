module.exports = function (api) {
  api && api.cache(true);
  return {
    // Place nativewind/babel in presets to avoid `.plugins` validation errors
    presets: ['babel-preset-expo', 'nativewind/babel'],
  };
};
