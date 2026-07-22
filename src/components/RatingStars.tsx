import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface Props {
  rating: number | null;
  size?: number;
}

/** 5 estrellitas, violeta hasta donde puntuaste, gris el resto. Si no hay rating, no muestra nada. */
export default function RatingStars({ rating, size = 12 }: Props) {
  if (!rating) return null;
  return (
    <View style={styles.fila}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name="star" size={size} color={n <= rating ? theme.colors.primaryLight : theme.colors.surfaceAlt} style={{ marginRight: 1 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center" },
});
