import React, { useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { searchSeries, searchMovies, posterUrl } from "../lib/tmdb";
import { seguirSerie, agregarPelicula } from "../lib/sync";
import { supabase } from "../lib/supabase";
import { Text } from "../components/Themed";
import { theme } from "../theme";

type Tipo = "series" | "movie";

interface Resultado {
  id: number;
  titulo: string;
  poster_path: string | null;
  tipo: Tipo;
}

export default function AddTitleScreen() {
  const [query, setQuery] = useState("");
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>("series");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [loading, setLoading] = useState(false);
  const [agregando, setAgregando] = useState<number | null>(null);
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const [{ data: series }, { data: movies }] = await Promise.all([
        supabase.from("user_series").select("series_tmdb_id").eq("user_id", uid),
        supabase.from("user_movies").select("movie_tmdb_id").eq("user_id", uid),
      ]);
      const set = new Set<string>();
      (series ?? []).forEach((s: any) => set.add(`series-${s.series_tmdb_id}`));
      (movies ?? []).forEach((m: any) => set.add(`movie-${m.movie_tmdb_id}`));
      setAgregados(set);
    });
  }, []);

  async function buscar(texto: string) {
    setQuery(texto);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    setLoading(true);
    setErrorBusqueda(null);
    try {
      const data = tipo === "series" ? await searchSeries(texto) : await searchMovies(texto);
      const mapeados: Resultado[] = (data.results ?? []).map((r: any) => ({
        id: r.id,
        titulo: tipo === "series" ? r.name : r.title,
        poster_path: r.poster_path,
        tipo,
      }));
      setResultados(mapeados);
    } catch (e: any) {
      console.error(e);
      setErrorBusqueda(e?.message ?? "Error desconocido buscando en TMDB.");
    } finally {
      setLoading(false);
    }
  }

  async function agregar(item: Resultado) {
    setAgregando(item.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      if (item.tipo === "series") await seguirSerie(userId, item.id);
      else await agregarPelicula(userId, item.id);
      setAgregados((prev) => new Set(prev).add(`${item.tipo}-${item.id}`));
    } catch (e) {
      console.error(e);
    } finally {
      setAgregando(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.tipoRow}>
        <Pressable
          style={[styles.tipoChip, tipo === "series" && styles.tipoChipActive]}
          onPress={() => {
            setTipo("series");
            setResultados([]);
          }}
        >
          <Text style={tipo === "series" ? styles.tipoTextActive : styles.tipoText}>Series</Text>
        </Pressable>
        <Pressable
          style={[styles.tipoChip, tipo === "movie" && styles.tipoChipActive]}
          onPress={() => {
            setTipo("movie");
            setResultados([]);
          }}
        >
          <Text style={tipo === "movie" ? styles.tipoTextActive : styles.tipoText}>Películas</Text>
        </Pressable>
      </View>

      <TextInput placeholderTextColor={theme.colors.textFaint}
        style={styles.input}
        placeholder={tipo === "series" ? "Buscar serie..." : "Buscar película..."}
        value={query}
        onChangeText={buscar}
      />

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      {errorBusqueda && !loading && (
        <Text style={{ color: "#FF6B6B", textAlign: "center", marginTop: 12, paddingHorizontal: 16 }}>
          No pudimos buscar en TMDB: {errorBusqueda}
        </Text>
      )}

      <FlatList
        keyboardShouldPersistTaps="handled"
        data={resultados}
        keyExtractor={(item) => `${item.tipo}-${item.id}`}
        renderItem={({ item }) => {
          const yaAgregado = agregados.has(`${item.tipo}-${item.id}`);
          return (
            <View style={styles.card}>
              {item.poster_path && (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              )}
              <Text style={styles.cardTitle}>{item.titulo}</Text>
              <Pressable
                style={[styles.addButton, yaAgregado && styles.addButtonAgregado]}
                onPress={() => agregar(item)}
                disabled={yaAgregado || agregando === item.id}
              >
                <Text style={[styles.addButtonText, yaAgregado && styles.addButtonTextAgregado]}>
                  {agregando === item.id ? "..." : yaAgregado ? "✓ Agregado" : "+ Agregar"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  tipoRow: { flexDirection: "row", marginBottom: 12 },
  tipoChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  tipoChipActive: { backgroundColor: theme.colors.primary },
  tipoText: { color: theme.colors.textMuted },
  tipoTextActive: { color: "#000000", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, marginBottom: 12, color: theme.colors.text, backgroundColor: theme.colors.surface },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  poster: { width: 40, height: 60, borderRadius: 4, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  cardTitle: { flex: 1, fontSize: 15 },
  addButton: { backgroundColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  addButtonText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  addButtonAgregado: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  addButtonTextAgregado: { color: theme.colors.textMuted },
});
