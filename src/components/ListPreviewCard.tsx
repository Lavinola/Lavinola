import React from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { posterUrl } from "../lib/tmdb";
import { Lista } from "../lib/lists";
import { theme } from "../theme";

interface Props {
  lista: Lista;
  onPress: () => void;
  subtitulo: string;
  accionesDerecha?: React.ReactNode;
}

/** Tarjeta de previsualización de una lista: título, descripción (hasta 2 líneas), subtítulo (cantidad/autor/etc — lo decide quien la usa) y una fila horizontal con las tapas de algunos de sus títulos. */
export default function ListPreviewCard({ lista, onPress, subtitulo, accionesDerecha }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.filaSuperior}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={1}>
            {lista.title}
          </Text>
          {lista.description ? (
            <Text style={styles.descripcion} numberOfLines={2}>
              {lista.description}
            </Text>
          ) : null}
          <Text style={styles.subtitulo}>{subtitulo}</Text>
        </View>
        {accionesDerecha ? <View style={{ marginLeft: 8 }}>{accionesDerecha}</View> : null}
      </View>
      {lista.portadas && lista.portadas.length > 0 && (
        <View style={styles.portadasRow}>
          {lista.portadas.map((p, i) => (
            <Image key={i} source={{ uri: posterUrl(p, "w185")! }} style={styles.portada} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaSuperior: { flexDirection: "row", alignItems: "center" },
  titulo: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  descripcion: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  subtitulo: { fontSize: 12, color: theme.colors.textFaint, marginTop: 4 },
  portadasRow: { flexDirection: "row", gap: 6, marginTop: 10, overflow: "hidden" },
  portada: { width: 46, height: 69, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt },
});
