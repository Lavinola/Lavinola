import React, { useEffect, useState } from "react";
import { View, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { getPersonDetails, getPersonCombinedCredits, posterUrl } from "../lib/tmdb";
import { syncSeries, syncMovie } from "../lib/sync";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { personId: number } };
  navigation: any;
}

export default function ActorDetailScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { personId } = route.params;
  const [persona, setPersona] = useState<any>(null);
  const [creditos, setCreditos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, [personId]);

  async function cargar() {
    setLoading(true);
    try {
      const [detalle, creditosData] = await Promise.all([getPersonDetails(personId), getPersonCombinedCredits(personId)]);
      setPersona(detalle);
      const todos = [...(creditosData.cast ?? [])]
        .filter((c: any) => c.poster_path)
        .sort((a: any, b: any) => {
          const fechaA = a.release_date || a.first_air_date || "";
          const fechaB = b.release_date || b.first_air_date || "";
          return fechaB.localeCompare(fechaA);
        });
      setCreditos(todos.slice(0, 30));
    } finally {
      setLoading(false);
    }
  }

  async function abrir(item: any) {
    const tipo = item.media_type === "movie" ? "movie" : "series";
    if (tipo === "series") await syncSeries(item.id);
    else await syncMovie(item.id);
    navigation.navigate("DetalleTitulo", { tmdbId: item.id, tipo });
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <FlatList
      data={creditos}
      keyExtractor={(c) => `${c.media_type}-${c.id}-${c.credit_id}`}
      numColumns={3}
      contentContainerStyle={{ padding: 12 }}
      ListHeaderComponent={
        <View style={styles.header}>
          {persona?.profile_path && <Image source={{ uri: posterUrl(persona.profile_path, "w342")! }} style={styles.foto} />}
          <Text style={styles.nombre}>{persona?.name}</Text>
          {persona?.birthday && (
            <Text style={styles.dato}>
              {t("Nacimiento")}: {persona.birthday}
              {persona.place_of_birth ? ` ${t("en")} ${persona.place_of_birth}` : ""}
            </Text>
          )}
          {persona?.biography ? <Text style={styles.bio}>{persona.biography.slice(0, 500)}</Text> : null}
          <Text style={styles.filmografiaTitulo}>{t("Filmografía")}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.item} onPress={() => abrir(item)}>
          <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
          <Text numberOfLines={2} style={styles.tituloItem}>
            {item.title ?? item.name}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 16 },
  foto: { width: 140, height: 210, borderRadius: 8, marginBottom: 12, backgroundColor: theme.colors.surfaceAlt },
  nombre: { fontSize: 20, fontWeight: "700" },
  dato: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, textAlign: "center" },
  bio: { fontSize: 13, color: theme.colors.text, marginTop: 12, textAlign: "left", lineHeight: 19 },
  filmografiaTitulo: { fontSize: 16, fontWeight: "700", alignSelf: "flex-start", marginTop: 20, marginBottom: 4 },
  item: { flex: 1 / 3, padding: 6 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  tituloItem: { fontSize: 11, marginTop: 4 },
});
