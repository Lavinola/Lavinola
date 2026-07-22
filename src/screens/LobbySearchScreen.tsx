import React, { useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { searchSeries, searchMovies, posterUrl } from "../lib/tmdb";
import { listarPostsDeTitulo, Post } from "../lib/posts";
import { supabase } from "../lib/supabase";
import PostCard from "../components/PostCard";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface ResultadoTitulo {
  id: number;
  titulo: string;
  poster_path: string | null;
  tipo: "series" | "movie";
  anio: string | null;
  popularidad: number;
}

interface Props {
  route: { params: { modo: "lobby" | "misPosts" } };
  navigation: any;
}

export default function LobbySearchScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { modo } = route.params;
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoTitulo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tituloElegido, setTituloElegido] = useState<ResultadoTitulo | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cargandoPosts, setCargandoPosts] = useState(false);

  async function buscar(texto: string) {
    setQuery(texto);
    setTituloElegido(null);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    setLoading(true);
    try {
      const [series, movies] = await Promise.all([searchSeries(texto), searchMovies(texto)]);
      const mezcla: ResultadoTitulo[] = [
        ...(series.results ?? []).map((s: any) => ({
          id: s.id,
          titulo: s.name,
          poster_path: s.poster_path,
          tipo: "series" as const,
          anio: s.first_air_date ? s.first_air_date.slice(0, 4) : null,
          popularidad: s.popularity ?? 0,
        })),
        ...(movies.results ?? []).map((p: any) => ({
          id: p.id,
          titulo: p.title,
          poster_path: p.poster_path,
          tipo: "movie" as const,
          anio: p.release_date ? p.release_date.slice(0, 4) : null,
          popularidad: p.popularity ?? 0,
        })),
      ];
      mezcla.sort((a, b) => b.popularidad - a.popularidad);
      setResultados(mezcla);
    } finally {
      setLoading(false);
    }
  }

  async function elegirTitulo(item: ResultadoTitulo) {
    setTituloElegido(item);
    setCargandoPosts(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      let lista = await listarPostsDeTitulo(item.tipo, item.id, undefined, undefined, uid);
      if (modo === "misPosts" && uid) lista = lista.filter((p) => p.user_id === uid);
      setPosts(lista);
    } finally {
      setCargandoPosts(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.buscador}
        placeholder={modo === "lobby" ? t("Buscar en Lobby...") : t("Buscar en mis posts...")}
        placeholderTextColor={theme.colors.textFaint}
        value={query}
        onChangeText={buscar}
        autoFocus
      />

      {tituloElegido ? (
        <>
          <Pressable style={styles.tituloElegidoRow} onPress={() => setTituloElegido(null)}>
            <Text style={styles.volverTexto}>‹ Volver a los resultados</Text>
          </Pressable>
          {cargandoPosts ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={posts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ padding: 12 }}
              ListEmptyComponent={
                <Text style={styles.vacio}>
                  {modo === "misPosts" ? "Todavía no publicaste nada sobre este título." : "Todavía no hay posts sobre este título."}
                </Text>
              }
              renderItem={({ item }) => <PostCard post={item} navigation={navigation} onCambio={() => elegirTitulo(tituloElegido)} />}
            />
          )}
        </>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={resultados}
          keyExtractor={(item) => `${item.tipo}-${item.id}`}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={query.trim().length >= 2 ? <Text style={styles.vacio}>No encontramos nada con ese nombre.</Text> : null}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => elegirTitulo(item)}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.tituloTexto}>{item.titulo}</Text>
                <Text style={styles.sub}>
                  {item.tipo === "series" ? "Serie" : "Película"}
                  {item.anio ? ` · ${item.anio}` : ""}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buscador: {
    margin: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 },
  poster: { width: 46, height: 46, borderRadius: 6, marginRight: 10 },
  tituloTexto: { fontSize: 15, fontWeight: "600" },
  sub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  tituloElegidoRow: { paddingHorizontal: 12, paddingBottom: 4 },
  volverTexto: { color: theme.colors.primaryLight, fontSize: 13, fontWeight: "700" },
});
