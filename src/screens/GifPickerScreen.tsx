import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { buscarGifs, buscarGifsTendenciaCine, GifResultado } from "../lib/gifs";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const TANDA = 15;

interface Props {
  route: { params: { onElegir: (gifUrl: string) => void } };
  navigation: any;
}

export default function GifPickerScreen({ route, navigation }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<GifResultado[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    buscarGifsTendenciaCine(0)
      .then((r) => {
        setResultados(r);
        setHayMas(r.length >= TANDA);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e.message ?? t("No se pudo cargar GIFs."));
        setLoading(false);
      });
  }, []);

  async function buscar(texto: string) {
    setQuery(texto);
    setLoading(true);
    setError(null);
    try {
      const r = texto.trim() ? await buscarGifs(texto.trim(), TANDA, 0) : await buscarGifsTendenciaCine(0);
      setResultados(r);
      setHayMas(r.length >= TANDA);
    } catch (e: any) {
      setError(e.message ?? t("No se pudo buscar GIFs."));
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }

  async function mostrarMas() {
    if (cargandoMas || !hayMas) return;
    setCargandoMas(true);
    try {
      const masNuevos = query.trim()
        ? await buscarGifs(query.trim(), TANDA, resultados.length)
        : await buscarGifsTendenciaCine(resultados.length);
      setResultados((prev) => [...prev, ...masNuevos]);
      setHayMas(masNuevos.length >= TANDA);
    } catch (e: any) {
      setError(e.message ?? t("No se pudieron cargar más GIFs."));
    } finally {
      setCargandoMas(false);
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
          contentContainerStyle={{ padding: 6, paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.vacio}>Sin resultados.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.cell} onPress={() => elegir(item)}>
              <Image source={{ uri: item.previewUrl }} style={styles.gif} />
            </Pressable>
          )}
          ListFooterComponent={
            resultados.length > 0 && hayMas ? (
              <Pressable style={styles.masBtn} onPress={mostrarMas} disabled={cargandoMas}>
                {cargandoMas ? <ActivityIndicator size="small" color={theme.colors.primaryLight} /> : <Text style={styles.masBtnTexto}>{t("Mostrar más")}</Text>}
              </Pressable>
            ) : null
          }
        />
      )}
      <View style={styles.atribucionRow}>
        <Text style={styles.atribucion}>Powered by GIPHY.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  cell: { flex: 1 / 3, padding: 4 },
  gif: { width: "100%", aspectRatio: 1, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  masBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20, marginTop: 8, marginBottom: 4 },
  masBtnTexto: { color: theme.colors.primaryLight, fontSize: 14, fontWeight: "700" },
  // Antes esto quedaba centrado abajo de todo, y en algunas pantallas el
  // botón/tab de "Comunidad" de la barra de navegación lo tapaba. Ahora va
  // pegado a la derecha, lejos de esa zona.
  atribucionRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 10, paddingVertical: 6 },
  atribucion: { fontSize: 10, color: theme.colors.textFaint },
});
