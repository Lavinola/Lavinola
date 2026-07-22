import React, { useEffect, useState } from "react";
import { FlatList, View, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { listarAnuncios, Anuncio } from "../lib/announcements";
import { theme } from "../theme";
import { formatearFecha } from "../lib/dates";

export default function AnnouncementsScreen() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);

  useEffect(() => {
    listarAnuncios().then(setAnuncios);
  }, []);

  return (
    <FlatList
      data={anuncios}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 12 }}
      ListEmptyComponent={<Text style={styles.vacio}>Todavía no hay anuncios.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.mensaje}>{item.message}</Text>
          <Text style={styles.fecha}>{formatearFecha(item.created_at)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, marginBottom: 10 },
  mensaje: { fontSize: 14 },
  fecha: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
});
