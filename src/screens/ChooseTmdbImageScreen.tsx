import React, { useRef, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { getSeriesImages, getMovieImages, posterUrl } from "../lib/tmdb";
import { buscarTitulosTolerante, ResultadoTitulo } from "../lib/tituloSearch";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: {
    params: {
      titulo: string; // ej: "Elegí una película o serie para la tapa"
      modo?: "posters" | "backdrops"; // posters = imagen vertical/cuadrada (tapa), backdrops = imagen ancha (banner). Default: backdrops.
      onElegir: (path: string, referencia: { tipo: "series" | "movie"; id: number; titulo: string }) => void;
    };
  };
  navigation: any;
}

/**
 * Pantalla reutilizable: buscás una película/serie de referencia y elegís uno
 * de sus posters o backdrops de TMDB. La usan tanto el banner de perfil como
 * la tapa y el banner de un grupo — así todo el catálogo de imágenes sale de
 * TMDB, sin depender de un buscador de fotos de stock aparte.
 */
export default function ChooseTmdbImageScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { titulo, onElegir, modo = "backdrops" } = route.params;
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoTitulo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tituloElegido, setTituloElegido] = useState<ResultadoTitulo | null>(null);
  const [backdrops, setBackdrops] = useState<any[]>([]);
  const [cargandoBackdrops, setCargandoBackdrops] = useState(false);
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

  async function abrirBackdrops(item: ResultadoTitulo) {
    setTituloElegido(item);
    setCargandoBackdrops(true);
    try {
      const data = item.tipo === "series" ? await getSeriesImages(item.id) : await getMovieImages(item.id);
      setBackdrops((modo === "posters" ? data.posters : data.backdrops) ?? []);
    } finally {
      setCargandoBackdrops(false);
    }
  }

  function elegir(path: string) {
    if (!tituloElegido) return;
    onElegir(path, { tipo: tituloElegido.tipo, id: tituloElegido.id, titulo: tituloElegido.titulo });
    navigation.goBack();
  }

  // Paso 2: eligiendo entre los backdrops disponibles de un título ya elegido.
  if (tituloElegido) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Pressable style={styles.volver} onPress={() => setTituloElegido(null)}>
          <Text style={styles.volverTexto}>‹ Elegir otro título</Text>
        </Pressable>
        <Text style={styles.subtitulo}>Elegí la imagen de "{tituloElegido.titulo}"</Text>
        {cargandoBackdrops ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={backdrops}
            key={modo}
            numColumns={modo === "posters" ? 3 : 1}
            keyExtractor={(item, i) => `${item.file_path}-${i}`}
            contentContainerStyle={{ padding: 8 }}
            ListEmptyComponent={<Text style={styles.vacio}>No hay imágenes disponibles para este título.</Text>}
            renderItem={({ item }) => (
              <Pressable style={[styles.backdropItem, modo === "posters" && { flex: 1 / 3 }]} onPress={() => elegir(item.file_path)}>
                <Image source={{ uri: posterUrl(item.file_path, "w342")! }} style={modo === "posters" ? styles.posterCuadrado : styles.backdrop} />
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // Paso 1: buscar el título de referencia.
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Text style={styles.instruccion}>{titulo}</Text>
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
          <Pressable style={styles.card} onPress={() => abrirBackdrops(item)}>
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
  instruccion: { fontSize: 13, color: theme.colors.textMuted, paddingHorizontal: 12, paddingTop: 12 },
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
  posterCuadrado: { width: "100%", aspectRatio: 1, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
});
