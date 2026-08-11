import React from "react";
import { View, StyleSheet } from "react-native";
import SkeletonBox from "./SkeletonBox";
import { theme } from "../theme";

/** Grilla de posters — para pantallas de "tus películas/series", pendientes, favoritos, etc. */
export function SkeletonPosterGrid({ columnas = 3, filas = 3 }: { columnas?: number; filas?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: columnas * filas }).map((_, i) => (
        <SkeletonBox key={i} width={`${100 / columnas - 2}%`} height={undefined} borderRadius={8} style={styles.gridItem} />
      ))}
    </View>
  );
}

/** Renglón tipo lista — avatar redondo + dos líneas de texto. Para notificaciones, seguidores, guardados, comentarios, chats. */
export function SkeletonListRow() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="70%" height={13} borderRadius={4} />
        <SkeletonBox width="45%" height={11} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonListRows({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <View style={{ padding: 12, gap: 4 }}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </View>
  );
}

/** Tarjeta tipo post del Lobby — avatar+nombre, unas líneas de texto, poster chico. */
export function SkeletonPostCard() {
  return (
    <View style={styles.postCard}>
      <View style={styles.row}>
        <SkeletonBox width={32} height={32} borderRadius={16} />
        <SkeletonBox width="40%" height={13} borderRadius={4} />
      </View>
      <SkeletonBox width="90%" height={12} borderRadius={4} style={{ marginTop: 10 }} />
      <SkeletonBox width="60%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
    </View>
  );
}

export function SkeletonPostCards({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <View style={{ padding: 12, gap: 12 }}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <SkeletonPostCard key={i} />
      ))}
    </View>
  );
}

/** Para el detalle de una película/serie/capítulo — poster grande arriba, título, y unas líneas de sinopsis. */
export function SkeletonTitleDetail() {
  return (
    <View style={{ padding: 16 }}>
      <SkeletonBox width="100%" height={220} borderRadius={10} />
      <SkeletonBox width="70%" height={20} borderRadius={4} style={{ marginTop: 16 }} />
      <SkeletonBox width="40%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
      <SkeletonBox width="100%" height={12} borderRadius={4} style={{ marginTop: 20 }} />
      <SkeletonBox width="100%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
      <SkeletonBox width="80%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: "2%" },
  gridItem: { aspectRatio: 2 / 3, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  postCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12 },
});
