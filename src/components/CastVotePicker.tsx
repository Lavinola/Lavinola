import React from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Themed";
import { posterUrl } from "../lib/tmdb";
import { theme } from "../theme";

interface Actor {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
}

interface Props {
  reparto: Actor[];
  miVoto: number | null;
  porcentajes: Record<number, number>;
  onVotar: (actor: Actor) => void;
}

export default function CastVotePicker({ reparto, miVoto, porcentajes, onVotar }: Props) {
  const yaVoto = miVoto != null;
  return (
    <FlatList
      horizontal
      data={reparto}
      keyExtractor={(a) => String(a.id)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      renderItem={({ item }) => {
        const elegido = miVoto === item.id;
        return (
          <Pressable style={styles.card} onPress={() => onVotar(item)}>
            <View style={[styles.fotoWrap, elegido && styles.fotoWrapElegido]}>
              {item.profile_path ? (
                <Image source={{ uri: posterUrl(item.profile_path, "w185")! }} style={styles.foto} />
              ) : (
                <View style={[styles.foto, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
            </View>
            <Text numberOfLines={1} style={[styles.nombre, elegido && styles.nombreElegido]}>
              {item.name}
            </Text>
            {yaVoto && <Text style={styles.porcentaje}>{porcentajes[item.id] ?? 0}%</Text>}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { width: 90, marginRight: 10, alignItems: "center" },
  fotoWrap: { borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  fotoWrapElegido: { borderColor: theme.colors.primaryLight },
  foto: { width: 86, height: 116, borderRadius: 6 },
  nombre: { fontSize: 12, fontWeight: "600", marginTop: 4, textAlign: "center" },
  nombreElegido: { color: theme.colors.primaryLight },
  porcentaje: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
