import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthenticatedImage } from './AuthenticatedImage';
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage';

const FILM_THUMB = 52;
const FILM_GAP = 6;

export type PhotoGalleryItem = {
  id: string;
  url: string;
  title: string;
};

type Props = {
  items: PhotoGalleryItem[];
  initialIndex?: number;
  onClose: () => void;
};

function GallerySlide({
  item,
  width,
  height,
}: {
  item: PhotoGalleryItem;
  width: number;
  height: number;
}) {
  const source = useAuthenticatedImage(item.url);

  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      {source ? (
        <Image source={source} style={{ width, height }} resizeMode="contain" />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

export function PhotoGalleryModal({ items, initialIndex = 0, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<PhotoGalleryItem>>(null);
  const stripRef = useRef<ScrollView>(null);
  const startIndex = Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0));
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    const x = Math.max(0, index * (FILM_THUMB + FILM_GAP) - width / 2 + FILM_THUMB / 2);
    stripRef.current?.scrollTo({ x, animated: true });
  }, [index, width]);

  const goTo = useCallback(
    (next: number, animated = true) => {
      if (next < 0 || next >= items.length) return;
      setIndex(next);
      listRef.current?.scrollToOffset({ offset: next * width, animated });
    },
    [items.length, width],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next >= 0 && next < items.length) setIndex(next);
    },
    [items.length, width],
  );

  const current = items[index];
  const canGoPrev = index > 0;
  const canGoNext = index < items.length - 1;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          disableIntervalMomentum
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onScrollToIndexFailed={(info) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({
                offset: info.index * width,
                animated: false,
              });
            });
          }}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => (
            <GallerySlide item={item} width={width} height={height} />
          )}
        />

        <View
          style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}
          pointerEvents="box-none"
        >
          <View style={styles.topSpacer} />
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {items.length > 1 && (
          <>
            {canGoPrev && (
              <Pressable
                onPress={() => goTo(index - 1)}
                style={[styles.navBtn, styles.navBtnLeft, { top: height / 2 - 28 }]}
                accessibilityRole="button"
                accessibilityLabel="Foto anterior"
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
            )}
            {canGoNext && (
              <Pressable
                onPress={() => goTo(index + 1)}
                style={[styles.navBtn, styles.navBtnRight, { top: height / 2 - 28 }]}
                accessibilityRole="button"
                accessibilityLabel="Foto siguiente"
              >
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </Pressable>
            )}
          </>
        )}

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {items.length > 1 && (
            <Text style={styles.counter}>
              {index + 1} / {items.length}
            </Text>
          )}
          {current?.title ? (
            <Text style={styles.caption} numberOfLines={1}>
              {current.title}
            </Text>
          ) : null}
          {items.length > 1 && (
            <ScrollView
              ref={stripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filmstrip}
            >
              {items.map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => goTo(i)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || `Foto ${i + 1}`}
                  accessibilityState={{ selected: i === index }}
                >
                  <AuthenticatedImage
                    pathOrUrl={item.url}
                    style={[styles.filmThumb, i === index && styles.filmThumbActive]}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  topSpacer: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    position: 'absolute',
    width: 48,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnLeft: { left: 8 },
  navBtnRight: { right: 8 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    gap: 4,
  },
  counter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  caption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 20,
  },
  filmstrip: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: FILM_GAP,
    alignItems: 'center',
  },
  filmThumb: {
    width: FILM_THUMB,
    height: FILM_THUMB,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filmThumbActive: {
    borderColor: '#fff',
  },
});
