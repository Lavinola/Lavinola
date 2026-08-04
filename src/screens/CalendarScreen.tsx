import React, { useState, useCallback, useRef } from "react";
import { View, Image, Pressable, SectionList, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { Text } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface EpisodioProximo {
  series_tmdb_id: number;
  series_name: string;
  poster_path: string | null;
  networks: string[];
  season_number: number;
  episode_number: number;
  name: string | null;
  air_date: string;
  yaSalio: boolean;
}

interface Seccion {
  title: string;
  data: EpisodioProximo[];
}

const DIAS_HACIA_ATRAS = 21; // cuánto pasado mostramos al scrollear para arriba

export default function CalendarScreen({ navigation }: any) {
  const { t, locale } = useT();
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<SectionList>(null);
  const indiceHoyRef = useRef(0);
  const yaScrolleoRef = useRef(false);

  function scrollAHoy(intentos = 6) {
    if (indiceHoyRef.current <= 0) return;
    try {
      listRef.current?.scrollToLocation({ sectionIndex: indiceHoyRef.current, itemIndex: 0, animated: false, viewOffset: 0 });
      yaScrolleoRef.current = true;
    } catch {
      // el SectionList todavía no terminó de medir el contenido, reintentamos en un toque
    }
    if (intentos > 0) setTimeout(() => scrollAHoy(intentos - 1), 120);
  }

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const hoyDate = new Date();
    const hoy = hoyDate.toISOString().slice(0, 10);
    const desde = new Date(hoyDate);
    desde.setDate(desde.getDate() - DIAS_HACIA_ATRAS);
    const desdeStr = desde.toISOString().slice(0, 10);

    const { data: seguidas } = await supabase
      .from("user_series")
      .select("series_tmdb_id, series_cache(name, poster_path, networks)")
      .eq("user_id", userId)
      .eq("in_watchlist", true);

    const ids = (seguidas ?? []).map((s: any) => s.series_tmdb_id);
    if (ids.length === 0) {
      setSecciones([]);
      setLoading(false);
      return;
    }

    const { data: episodios } = await supabase
      .from("episodes_cache")
      .select("series_tmdb_id, season_number, episode_number, name, air_date")
      .in("series_tmdb_id", ids)
      .gte("air_date", desdeStr)
      .order("air_date", { ascending: true });

    const infoSerie: Record<number, { nombre: string; poster: string | null; networks: string[] }> = {};
    (seguidas ?? []).forEach((s: any) => {
      infoSerie[s.series_tmdb_id] = {
        nombre: s.series_cache?.name ?? "—",
        poster: s.series_cache?.poster_path ?? null,
        networks: s.series_cache?.networks ?? [],
      };
    });

    const porFecha: Record<string, EpisodioProximo[]> = {};
    (episodios ?? []).forEach((e: any) => {
      const fecha = e.air_date as string;
      if (!porFecha[fecha]) porFecha[fecha] = [];
      const info = infoSerie[e.series_tmdb_id];
      porFecha[fecha].push({
        series_tmdb_id: e.series_tmdb_id,
        series_name: info?.nombre ?? "—",
        poster_path: info?.poster ?? null,
        networks: info?.networks ?? [],
        season_number: e.season_number,
        episode_number: e.episode_number,
        name: e.name,
        air_date: fecha,
        yaSalio: fecha <= hoy,
      });
    });

    const fechasOrdenadas = Object.keys(porFecha).sort();
    const secc: Seccion[] = fechasOrdenadas.map((fecha) => ({
      title: etiquetaFecha(fecha, t, locale),
      data: porFecha[fecha],
    }));

    // Guardamos en qué sección arranca "hoy" para abrir la pantalla ahí directamente.
    indiceHoyRef.current = Math.max(0, fechasOrdenadas.findIndex((f) => f >= hoy));

    setSecciones(secc);
    setLoading(false);
    yaScrolleoRef.current = false;
    setTimeout(() => scrollAHoy(), 60);
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <Text style={styles.empty}>Cargando...</Text>
      ) : (
        <SectionList
          ref={listRef}
          sections={secciones}
          keyExtractor={(item, idx) => `${item.series_tmdb_id}-${item.season_number}-${item.episode_number}-${idx}`}
          ListEmptyComponent={<Text style={styles.empty}>No hay estrenos próximos de tus series seguidas.</Text>}
          onContentSizeChange={() => {
            if (!yaScrolleoRef.current) scrollAHoy(2);
          }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const dias = diasHasta(item.air_date);
            return (
              <View style={[styles.item, !item.yaSalio && styles.itemFuturo]}>
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                  onPress={() =>
                    navigation.navigate("EpisodioDetalle", {
                      seriesTmdbId: item.series_tmdb_id,
                      seasonNumber: item.season_number,
                      episodeNumber: item.episode_number,
                      episodeName: item.name,
                    })
                  }
                >
                  {item.poster_path ? (
                    <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
                  ) : (
                    <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Pressable
                      style={styles.tituloRow}
                      onPress={() => navigation.navigate("DetalleTitulo", { tmdbId: item.series_tmdb_id, tipo: "series" })}
                    >
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.series_name}
                      </Text>
                      <Text style={styles.flecha}>›</Text>
                    </Pressable>
                    <Text style={styles.itemNombreEpisodio} numberOfLines={1}>
                      {item.name ?? `Episodio ${item.episode_number}`}
                    </Text>
                    <Text style={styles.itemSub}>
                      T{item.season_number} - E{item.episode_number}
                    </Text>
                    {item.networks.length > 0 && <Text style={styles.itemPlataforma}>{item.networks.join(", ")}</Text>}
                  </View>
                  {!item.yaSalio && dias != null && (
                    <View style={styles.faltanCol}>
                      <Text style={styles.faltanTexto}>{dias === 1 ? t("Falta") : t("Faltan")}</Text>
                      <Text style={styles.faltanNumero}>{dias}</Text>
                      <Text style={styles.faltanTexto}>{dias === 1 ? t("día") : t("días")}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function diasHasta(iso: string): number | null {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(iso + "T00:00:00");
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : null;
}

function etiquetaFecha(iso: string, t: (s: string) => string, locale: string): string {
  const hoy = new Date();
  const fecha = new Date(iso + "T00:00:00");
  const hoyStr = hoy.toISOString().slice(0, 10);
  const mañana = new Date(hoy);
  mañana.setDate(mañana.getDate() + 1);
  const mañanaStr = mañana.toISOString().slice(0, 10);
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().slice(0, 10);

  if (iso === hoyStr) return t("Hoy");
  if (iso === mañanaStr) return t("Mañana");
  if (iso === ayerStr) return t("Ayer");
  return fecha.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { textAlign: "center", marginTop: 32, color: theme.colors.textMuted },
  sectionHeaderWrap: { backgroundColor: theme.colors.background, paddingTop: 4 },
  sectionHeader: { fontSize: 13, fontWeight: "700", backgroundColor: theme.colors.surface, padding: 10, textTransform: "capitalize", color: theme.colors.textMuted, textAlign: "center" },
  item: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  itemMarcado: { backgroundColor: "rgba(76, 175, 125, 0.15)" },
  itemFuturo: {},
  poster: { width: 46, height: 69, borderRadius: 4, marginRight: 10 },
  tituloRow: { flexDirection: "row", alignItems: "center" },
  itemTitle: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted, flexShrink: 1 },
  flecha: { fontSize: 16, color: theme.colors.textMuted, marginLeft: 4 },
  itemNombreEpisodio: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  itemSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  itemPlataforma: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  faltanCol: { alignItems: "center", justifyContent: "center", marginLeft: 8, paddingLeft: 8 },
  faltanTexto: { fontSize: 11, color: "#FFFFFF", fontWeight: "600" },
  faltanNumero: { fontSize: 22, color: "#FFFFFF", fontWeight: "800", lineHeight: 26 },
  tildeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  tildeBtnMarcado: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  tildeTexto: { color: theme.colors.primary, fontSize: 14, fontWeight: "700" },
  tildeTextoMarcado: { color: theme.colors.text },
});
