import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { buscarGifs, buscarGifsTendenciaCine, GifResultado } from "../lib/gifs";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { onElegir: (gifUrl: string) => void } };
  navigation: any;
}

export default function GifPickerScreen({ route, navigation }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<GifResultado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    buscarGifsTendenciaCine()
      .then((r) => {
        setResultados(r);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e.message ?? "No se pudo cargar GIFs.");
        setLoading(false);
      });
  }, []);

  async function buscar(texto: string) {
    setQuery(texto);
    setLoading(true);
    setError(null);
    try {
      const r = texto.trim() ? await buscarGifs(texto.trim()) : await buscarGifsTendenciaCine();
      setResultados(r);
    } catch (e: any) {
      setError(e.message ?? "No se pudo buscar GIFs.");
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }

  function elegir(gif: GifResultado) {
    route.params.onElegir(gif.gifUrl);
    navigation.goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.input}
        placeholder={t("Buscar GIF (ej: nombre de una serie)...")}
        placeholderTextColor={theme.colors.textFaint}
        value={query}
        onChangeText={buscar}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.vacio}>{error}</Text>
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(g) => g.id}
          numColumns={3}
          contentContainerStyle={{ padding: 6 }}
          ListEmptyComponent={<Text style={styles.vacio}>Sin resultados.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.cell} onPress={() => elegir(item)}>
              <Image source={{ uri: item.previewUrl }} style={styles.gif} />
            </Pressable>
          )}
        />
      )}
      <Text style={styles.atribucion}>Powered by GIPHY.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  cell: { flex: 1 / 3, padding: 4 },
  gif: { width: "100%", aspectRatio: 1, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  atribucion: { fontSize: 10, color: theme.colors.textFaint, textAlign: "center", padding: 8 },
});
