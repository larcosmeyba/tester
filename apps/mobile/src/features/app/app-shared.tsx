// Small presentational pieces used by more than one feature, and the style
// keys they share.
//
// This file exists so the feature screens do not have to import from each other.
// Everything here came out of app-root.tsx unchanged.

import { type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, Card, HiveIcon, rowStyles } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { type Deal } from '@/data/mock-data';
import { StyleSheet } from 'react-native';

export function HorizontalScroller({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sharedStyles.horizontalScroller}>
      {children}
    </ScrollView>
  );
}

export function DealCard({
  deal,
  onAdd,
  inCart,
  wide = false,
}: {
  deal: Deal;
  onAdd: () => void;
  inCart: boolean;
  wide?: boolean;
}) {
  return (
    <Card style={[sharedStyles.dealCard, wide && sharedStyles.dealCardWide]}>
      <View style={[sharedStyles.dealArt, { backgroundColor: deal.color }]}>
        <HiveIcon name="cart" size={28} color={HiveColors.white} />
      </View>
      <Text style={sharedStyles.dealTitle}>{deal.title}</Text>
      <Text style={sharedStyles.miniMuted}>{deal.store}</Text>
      <View style={rowStyles.row}>
        <Text style={sharedStyles.dealPrice}>{deal.price}</Text>
        <Text style={sharedStyles.dealOriginal}>{deal.originalPrice}</Text>
      </View>
      <Text style={sharedStyles.dealTag}>{deal.tag}</Text>
      <AppButton title={inCart ? 'Added' : 'Add'} variant={inCart ? 'secondary' : 'primary'} onPress={onAdd} style={sharedStyles.smallCardButton} />
    </Card>
  );
}

export function Bullet({ text }: { text: string }) {
  return (
    <View style={sharedStyles.bulletRow}>
      <View style={sharedStyles.bullet} />
      <Text style={sharedStyles.cardBody}>{text}</Text>
    </View>
  );
}

export function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export const sharedStyles = StyleSheet.create({
  authError: {
    color: HiveColors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  bigIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.green,
    marginTop: 7,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardBody: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  cardTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  centerText: {
    textAlign: 'center',
  },
  centeredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  centeredHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: HiveColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dealArt: {
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealCard: {
    width: 158,
    gap: 6,
  },
  dealCardWide: {
    width: '100%',
  },
  dealOriginal: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  dealPrice: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
  },
  dealTag: {
    color: HiveColors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  dealTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  fieldGroupLabel: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  flexOne: {
    flex: 1,
  },
  formScreen: {
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  fullWidth: {
    width: '100%',
  },
  greenLink: {
    color: HiveColors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  gridList: {
    gap: 12,
    padding: 20,
  },
  headerSpacer: { width: 38 },
  helperText: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  homeSectionTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  horizontalScroller: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  listStack: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  miniMuted: {
    color: HiveColors.textSecondary,
    fontSize: 12,
  },
  permissionScreen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 42,
    gap: 14,
  },
  permissionSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  permissionTitle: {
    color: HiveColors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  smallCardButton: {
    minHeight: 38,
    marginTop: 4,
  },
  tabScreen: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  videoHero: {
    height: 220,
    backgroundColor: '#252529',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
