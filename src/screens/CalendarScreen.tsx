import React, { useState, useCallback, useRef } from "react";
import { View, Image, Pressable, SectionList, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { posterUrl } from "../lib/tmdb";
import { getSeriesWatchProvidersLoteCacheado, syncSeries } from "../lib/sync";
import { Text } from "../components/Themed";
import EstadoVacio from "../components/EstadoVacio";
import { useT } from "../i18n/i18n";
import { Idioma } from "../i18n/translations";
import { theme } from "../theme";

interface EpisodioProximo {
  series_tmdb_id: number;
  series_name: string;
  poster_path: string | null;
  plataformas: string[]; // dónde verlo, según el país del usuario (no el canal de emisión original)
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
  const { t, idioma } = useT();
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idioma])
  );

  async function cargar(esRefrescoSilencioso = false) {
    if (!esRefrescoSilencioso) setLoading(true);
    const { data: userData } = await supabase.auth.getSession();
    const userId = userData.session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const hoyDate = new Date();
    const hoy = fechaLocalISO(hoyDate);
    const desde = new Date(hoyDate);
    desde.setDate(desde.getDate() - DIAS_HACIA_ATRAS);
    const desdeStr = fechaLocalISO(desde);

    const { data: perfil } = await supabase.from("profiles").select("country").eq("id", userId).maybeSingle();
    const watchRegion = perfil?.country ?? "AR";

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
      .order("air_date", { ascending: true })
      .order("series_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true });

    // Dónde ver cada serie según el país del usuario — no el canal de
    // emisión original de TMDB (ese es fijo, sin importar el país; por
    // ejemplo una serie de FX en EE.UU. puede estar en Disney+ acá).
    // Una sola consulta para todas las series juntas (no una por serie).
    const idsUnicos = [...new Set(ids)];
    const providersPorSerie = await getSeriesWatchProvidersLoteCacheado(idsUnicos, watchRegion);

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
      // Si no hay dato de plataforma para el país del usuario (puede pasar
      // con series chicas o sin distribución confirmada ahí todavía),
      // mostramos el canal original como respaldo antes que no mostrar nada.
      const plataformas = providersPorSerie[e.series_tmdb_id]?.length ? providersPorSerie[e.series_tmdb_id] : info?.networks ?? [];
      porFecha[fecha].push({
        series_tmdb_id: e.series_tmdb_id,
        series_name: info?.nombre ?? "—",
        poster_path: info?.poster ?? null,
        plataformas,
        season_number: e.season_number,
        episode_number: e.episode_number,
        name: e.name,
        air_date: fecha,
        yaSalio: fecha <= hoy,
      });
    });

    const fechasOrdenadas = Object.keys(porFecha).sort();
    const secc: Seccion[] = fechasOrdenadas.map((fecha) => ({
      title: etiquetaFecha(fecha, t, idioma),
      data: porFecha[fecha],
    }));

    // Guardamos en qué sección arranca "hoy" para abrir la pantalla ahí directamente.
    indiceHoyRef.current = Math.max(0, fechasOrdenadas.findIndex((f) => f >= hoy));

    setSecciones(secc);
    setLoading(false);
    yaScrolleoRef.current = false;
    setTimeout(() => scrollAHoy(), 60);

    // En segundo plano, sin bloquear lo que ya se ve: nos aseguramos de que
    // cada serie seguida esté al día en TMDB. syncSeries ya se frena solo
    // si se sincronizó hace menos de 24hs, así que en el caso normal esto
    // no hace nada — pero si alguna quedó vieja (nadie entró a su ficha en
    // un tiempo), se actualiza acá y recargamos una vez más, ya con los
    // datos frescos, sin mostrar el spinner de nuevo.
    if (!esRefrescoSilencioso) {
      Promise.all(idsUnicos.map((id) => syncSeries(id).catch((e) => console.error("No se pudo resincronizar la serie", id, e)))).then(() => {
        cargar(true);
      });
    }
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
          ListEmptyComponent={<EstadoVacio icono="calendar-outline" titulo="No hay estrenos próximos de tus series seguidas." />}
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
                    {item.plataformas.length > 0 && <Text style={styles.itemPlataforma}>{item.plataformas.join(", ")}</Text>}
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

// Hermes (el motor de JS de React Native) no siempre trae los datos de
// internacionalización completos — así que toLocaleDateString(locale,...)
// puede terminar mostrando el día/mes en el idioma que le salga, sin
// importar qué locale le pidas. Para no depender de eso, armamos el
// nombre del día y del mes a mano, con nuestras propias traducciones.
const DIAS_SEMANA: Record<Idioma, string[]> = {
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  pt: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
  it: ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
};
const MESES: Record<Idioma, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  it: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
};

// Ojo con esto: NUNCA usar toISOString() acá para comparar fechas de
// calendario — toISOString() convierte a UTC, y a la noche en Argentina
// (UTC-3) ya cae del lado del día siguiente en UTC, corriendo "hoy" y
// "mañana" un día para adelante. Comparamos siempre con los componentes
// de fecha en hora LOCAL del celular (año/mes/día), igual que ya hace
// diasHasta() más abajo.
function fechaLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function etiquetaFecha(iso: string, t: (s: string) => string, idioma: Idioma): string {
  const hoy = new Date();
  const fecha = new Date(iso + "T00:00:00");
  const hoyStr = fechaLocalISO(hoy);
  const mañana = new Date(hoy);
  mañana.setDate(mañana.getDate() + 1);
  const mañanaStr = fechaLocalISO(mañana);
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = fechaLocalISO(ayer);

  if (iso === hoyStr) return t("Hoy");
  if (iso === mañanaStr) return t("Mañana");
  if (iso === ayerStr) return t("Ayer");

  const diaSemana = DIAS_SEMANA[idioma][fecha.getDay()];
  const mes = MESES[idioma][fecha.getMonth()];
  const dia = fecha.getDate();
  // En inglés el orden natural es "Sunday, August 9" (mes antes que el día).
  return idioma === "en" ? `${diaSemana}, ${mes} ${dia}` : `${diaSemana}, ${dia} de ${mes}`;
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
  itemSub: { fontSize: 12, color: theme.colors.text, marginTop: 1 },
  itemPlataforma: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  faltanCol: { alignItems: "center", justifyContent: "center", marginLeft: 8, paddingLeft: 8 },
  faltanTexto: { fontSize: 11, color: "#FFFFFF", fontWeight: "600" },
  faltanNumero: { fontSize: 22, color: "#FFFFFF", fontWeight: "800", lineHeight: 26 },
  tildeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  tildeBtnMarcado: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  tildeTexto: { color: theme.colors.primary, fontSize: 14, fontWeight: "700" },
  tildeTextoMarcado: { color: theme.colors.text },
});
