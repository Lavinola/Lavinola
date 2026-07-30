import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

// Igual que en BadgesScreen: Metro necesita los require() escritos literal,
// no se puede armar el path con un string dinámico.
export const IMAGENES_INSIGNIAS_CHICAS: Record<number, any> = {
  1: require("../../assets/badges/small/nivel-1.png"),
  2: require("../../assets/badges/small/nivel-2.png"),
  3: require("../../assets/badges/small/nivel-3.png"),
  4: require("../../assets/badges/small/nivel-4.png"),
  5: require("../../assets/badges/small/nivel-5.png"),
  6: require("../../assets/badges/small/nivel-6.png"),
  7: require("../../assets/badges/small/nivel-7.png"),
  8: require("../../assets/badges/small/nivel-8.png"),
  9: require("../../assets/badges/small/nivel-9.png"),
  10: require("../../assets/badges/small/nivel-10.png"),
};

export default function InsigniaChica({ nivel, size = 44, style }: { nivel: number; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={IMAGENES_INSIGNIAS_CHICAS[nivel]} style={[{ width: size, height: size, borderRadius: 8 }, style]} resizeMode="contain" />;
}
