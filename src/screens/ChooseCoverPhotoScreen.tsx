import React, { useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { getSeriesImages, getMovieImages, posterUrl } from "../lib/tmdb";
import { buscarTitulosTolerante, ResultadoTitulo } from "../lib/tituloSearch";
import { setCoverPhoto } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function ChooseCoverPhotoScreen({ navigation }: any) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoTitulo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tituloElegido, setTituloElegido] = useState<ResultadoTitulo | null>(null);
  const [banners, setBanners] = useState<any[]>([]);
  const [cargandoBanners, setCargandoBanners] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const idPedidoRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buscar(texto: string) {
    setQuery(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 2) {
      idPedidoRef.current++;
      setResultados([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Esperamos un poquito (debounce) antes de disparar la búsqueda — si no,
    // cada letra que escribís dispara un pedido nuevo a TMDB.
    debounceRef.current = setTimeout(() => ejecutarBusqueda(texto), 350);
  }

  async function ejecutarBusqueda(texto: string) {
    const miId = ++idPedidoRef.current;
    try {
      const mezcla = await buscarTitulosTolerante(texto, () => idPedidoRef.current === miId);
      if (idPedidoRef.current !== miId) return; // llegó tarde, ya hay una búsqueda más nueva en curso
      setResultados(mezcla);
    } finally {
      if (idPedidoRef.current === miId) setLoading(false);
    }
  }

  async function abrirBanners(item: ResultadoTitulo) {
    setTituloElegido(item);
    setCargandoBanners(true);
    try {
      const data = item.tipo === "series" ? await getSeriesImages(item.id) : await getMovieImages(item.id);
      setBanners(data.backdrops ?? []);
    } finally {
      setCargandoBanners(false);
    }
  }

  async function elegirBanner(path: string) {
    if (!tituloElegido) return;
    setGuardando(path);
    try {
      const { data: userData } = await supabase.auth.getSession();
      const userId = userData.session?.user?.id;
      if (!userId) return;
      await setCoverPhoto(userId, tituloElegido.tipo, tituloElegido.id, path);
      navigation.goBack();
    } finally {
      setGuardando(null);
    }
  }

  // Paso 2: eligiendo entre los banners disponibles de un título ya elegido.
  if (tituloElegido) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Pressable style={styles.volver} onPress={() => setTituloElegido(null)}>
          <Text style={styles.volverTexto}>‹ Elegir otro título</Text>
        </Pressable>
        <Text style={styles.subtitulo}>Elegí el banner para "{tituloElegido.titulo}"</Text>
        {cargandoBanners ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={banners}
            keyExtractor={(item, i) => `${item.file_path}-${i}`}
            contentContainerStyle={{ padding: 8 }}
            ListEmptyComponent={<Text style={styles.vacio}>No hay banners disponibles para este título.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.backdropItem} onPress={() => elegirBanner(item.file_path)} disabled={!!guardando}>
                <Image source={{ uri: posterUrl(item.file_path, "w342")! }} style={styles.backdrop} />
                {guardando === item.file_path && (
                  <View style={styles.overlayCargando}>
                    <ActivityIndicator color={theme.colors.text} />
                  </View>
                )}
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // Paso 1: buscar el título.
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.input}
        placeholder={t("Buscá series y películas")}
        placeholderTextColor={theme.colors.textFaint}
        value={query}
        onChangeText={buscar}
      />
      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      <FlatList
        data={resultados}
        keyExtractor={(item) => `${item.tipo}-${item.id}`}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => abrirBanners(item)}>
            {item.poster_path ? (
              <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
            ) : (
              <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>{item.titulo}</Text>
              {!!item.anio && <Text style={styles.anio}>{item.anio}</Text>}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  card: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  poster: { width: 40, height: 60, borderRadius: 4, marginRight: 12 },
  titulo: { fontSize: 15 },
  anio: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  volver: { padding: 12 },
  volverTexto: { color: theme.colors.primaryLight, fontSize: 14, fontWeight: "600" },
  subtitulo: { fontSize: 14, color: theme.colors.textMuted, paddingHorizontal: 12, marginBottom: 4 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  backdropItem: { padding: 4 },
  backdrop: { width: "100%", aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  overlayCargando: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", margin: 4, borderRadius: 6 },
});

