const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, result => {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
  // RN updates scaled resources; retaining the activity avoids duplicate Router roots and stale picker launchers.
  const changes = new Set((activity.$['android:configChanges'] || '').split('|').filter(Boolean));
  changes.add('fontScale');
  changes.add('density');
  activity.$['android:configChanges'] = [...changes].join('|');
  return result;
});
