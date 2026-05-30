// babel-preset-expo includes expo-router and React Native transforms for the
// installed SDK. No extra plugins needed for the current setup.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
