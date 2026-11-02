import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button } from '../../components/Controls';
import { Property, mediaUri } from './contracts';
import { styles } from '../../theme/tokens';
function Video({ uri }: { uri: string }) { const player = useVideoPlayer(uri); return <VideoView player={player} nativeControls style={{ width: '100%', height: 260 }} />; }
export function Gallery({ property, origin }: { property: Property; origin: string }) {
  const [index, setIndex] = useState(0), [failed, setFailed] = useState(false);
  const media = [...property.images.map(url => ({ url, video: false })), ...property.videos.map(url => ({ url, video: true }))];
  const current = media[Math.min(index, media.length - 1)], uri = current && mediaUri(origin, current.url);
  return <View style={{ gap: 10 }}>{uri ? current.video ? <Video key={uri} uri={uri} /> : <Image source={{ uri }} onError={() => setFailed(true)} accessibilityLabel={`Property photo ${index + 1}`} resizeMode="contain" style={{ width: '100%', height: 260 }} /> : <Text style={styles.muted}>No photos or videos available.</Text>}
    {failed && <Text style={styles.muted}>This photo could not load.</Text>}{!!media.length && <Text style={styles.muted}>{index + 1} of {media.length} · {current.video ? 'Video' : 'Photo'}</Text>}
    {media.length > 1 && <><Button title="Previous media" secondary disabled={index === 0} onPress={() => { setIndex(i => i - 1); setFailed(false); }} /><Button title="Next media" secondary disabled={index === media.length - 1} onPress={() => { setIndex(i => i + 1); setFailed(false); }} /></>}
  </View>;
}
