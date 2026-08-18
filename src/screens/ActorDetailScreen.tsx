import React, { useEffect, useState } from "react";
import { View, Image, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import ExpandableText from "../components/ExpandableText";
import { getPersonDetails, getPersonCombinedCredits, posterUrl } from "../lib/tmdb";
import { traducirTexto } from "../lib/translate";
import { syncSeries, syncMovie } from "../lib/sync";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import { Alert } from "../lib/alert";

interface Props {
  route: { params: { personId: number } };
  navigation: any;
}

export default function ActorDetailScreen({ route, navigation }: Props) {
  const { t, idioma } = useT();
  const { personId } = route.params;
  const [persona, setPersona] = useState<any>(null);
  const [creditos, setCreditos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [traduccionBio, setTraduccionBio] = useState<string | null>(null);
  const [traduciendoBio, setTraduciendoBio] = useState(false);
  const [cantidadMostrada, setCantidadMostrada] = useState(15);

  useEffect(() => {
    setTraduccionBio(null);
    setCantidadMostrada(15);
    cargar();
  }, [personId]);

  async function traducirBio() {
    if (traduccionBio) {
      setTraduccionBio(null);
      return;
    }
    if (!persona?.biography) return;
    setTraduciendoBio(true);
    try {
      setTraduccionBio(await traducirTexto(persona.biography.slice(0, 500), idioma));
    } catch (e: any) {
      Alert.alert(t("No se pudo traducir"), e.message);
    } finally {
      setTraduciendoBio(false);
    }
  }

  async function cargar() {
    setLoading(true);
    try {
      const [detalle, creditosData] = await Promise.all([getPersonDetails(personId), getPersonCombinedCredits(personId)]);
      setPersona(detalle);
      navigation.setOptions({ title: detalle?.name ?? t("Actor/Actriz") });
      // Combinamos actuación (cast) y dirección (crew, job="Director") —
      // si no, alguien que es director pero no actúa quedaría con la
      // filmografía vacía.
      const actuacion = creditosData.cast ?? [];
      const direccion = (creditosData.crew ?? []).filter((c: any) => c.job === "Director");
      const combinados = [...actuacion, ...direccion];
      const sinDuplicados = new Map<string, any>();
      for (const c of combinados) {
        const clave = `${c.media_type}-${c.id}`;
        if (!sinDuplicados.has(clave)) sinDuplicados.set(clave, c);
      }
      const todos = [...sinDuplicados.values()]
        .filter((c: any) => c.poster_path)
        .sort((a: any, b: any) => {
          const fechaA = a.release_date || a.first_air_date || "";
          const fechaB = b.release_date || b.first_air_date || "";
          return fechaB.localeCompare(fechaA);
        });
      setCreditos(todos);
    } finally {
      setLoading(false);
    }
  }

  async function abrir(item: any) {
    const tipo = item.media_type === "movie" ? "movie" : "series";
    if (tipo === "series") await syncSeries(item.id);
    else await syncMovie(item.id);
    navigation.push("DetalleTitulo", { tmdbId: item.id, tipo });
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <FlatList
      data={creditos.slice(0, cantidadMostrada)}
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
          {persona?.biography ? (
            <>
              <ExpandableText texto={traduccionBio ?? persona.biography} style={styles.bio} maxLines={5} indicador="puntos" />
              <Pressable onPress={traducirBio} disabled={traduciendoBio} style={styles.traducirBioBtn}>
                <Text style={styles.traducirBioTexto}>{traduciendoBio ? t("Traduciendo...") : traduccionBio ? t("Ver original") : t("Traducir")}</Text>
              </Pressable>
            </>
          ) : null}
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
      ListFooterComponent={
        cantidadMostrada < creditos.length ? (
          <Pressable style={styles.mostrarMasBtn} onPress={() => setCantidadMostrada((c) => c + 15)}>
            <Text style={styles.mostrarMasTexto}>{t("Mostrar más")}</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 16 },
  mostrarMasBtn: { alignItems: "center", paddingVertical: 16 },
  mostrarMasTexto: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700" },
  foto: { width: 140, height: 210, borderRadius: 8, marginBottom: 12, backgroundColor: theme.colors.surfaceAlt },
  nombre: { fontSize: 20, fontWeight: "700" },
  dato: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, textAlign: "center" },
  bio: { fontSize: 13, color: theme.colors.text, marginTop: 12, textAlign: "left", lineHeight: 19 },
  traducirBioBtn: { alignSelf: "flex-end", marginTop: 6 },
  traducirBioTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  filmografiaTitulo: { fontSize: 16, fontWeight: "700", alignSelf: "flex-start", marginTop: 20, marginBottom: 4 },
  item: { flex: 1 / 3, padding: 6 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: theme.colors.surfaceAlt },
  tituloItem: { fontSize: 11, marginTop: 4 },
});
