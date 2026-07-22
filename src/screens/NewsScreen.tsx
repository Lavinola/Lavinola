import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Text } from "../components/Themed";
import { listarNoticias, NoticiaFeed } from "../lib/news";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

function tiempoRelativo(fechaTexto: string | null): string {
  if (!fechaTexto) return "";
  const fecha = new Date(fechaTexto);
  if (isNaN(fecha.getTime())) return "";
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}

export default function NewsScreen() {
  const { idioma } = useT();
  const [noticias, setNoticias] = useState<NoticiaFeed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, [idioma]);

  async function cargar() {
    setLoading(true);
    try {
      setNoticias(await listarNoticias(idioma));
    } finally {
      setLoading(false);
    }
  }

  async function abrirNoticia(link: string) {
    await WebBrowser.openBrowserAsync(link);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={noticias}
      keyExtractor={(n, i) => `${n.link}-${i}`}
      contentContainerStyle={{ padding: 12 }}
      onRefresh={cargar}
      refreshing={loading}
      ListEmptyComponent={<Text style={styles.vacio}>No pudimos traer noticias en este momento. Probá de nuevo más tarde.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => abrirNoticia(item.link)}>
          {item.imagen ? (
            <Image source={{ uri: item.imagen }} style={styles.imagen} />
          ) : (
            <View style={[styles.imagen, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo} numberOfLines={3}>
              {item.titulo}
            </Text>
            {item.resumen && (
              <Text style={styles.resumen} numberOfLines={2}>
                {item.resumen}
              </Text>
            )}
            <Text style={styles.fuenteFecha}>
              {item.fuente}
              {item.fecha ? ` · ${tiempoRelativo(item.fecha)}` : ""}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  card: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 10,
  },
  imagen: { width: 88, height: 88, borderRadius: 8, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  titulo: { fontSize: 14, fontWeight: "700" },
  resumen: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  fuenteFecha: { fontSize: 11, color: theme.colors.primaryLight, marginTop: 6, fontWeight: "700" },
});
