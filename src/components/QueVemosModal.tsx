import React, { useEffect, useState } from "react";
import { Modal, View, Pressable, Image, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { GENEROS_PELICULAS, GENEROS_SERIES } from "../lib/tmdbGenres";
import { getWatchProvidersDisponibles, GrupoPlataforma, posterUrl } from "../lib/tmdb";
import { elegirQueVemos, elegirQueVemosGrupo } from "../lib/queVemos";
import { enviarQueVemos } from "../lib/chats";
import { recomendarEnGrupo } from "../lib/comments";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Props =
  | {
      modo: "chat";
      visible: boolean;
      onCerrar: () => void;
      chatId: string;
      userId: string;
      otroUserId: string;
      watchRegion: string;
      onEnviado: () => void;
    }
  | {
      modo: "grupo";
      visible: boolean;
      onCerrar: () => void;
      groupId: string;
      userId: string;
      miembroIds: string[];
      watchRegion: string;
      onEnviado: () => void;
    };

export default function QueVemosModal(props: Props) {
  const { visible, onCerrar, watchRegion, onEnviado } = props;
  const { t } = useT();
  const [paso, setPaso] = useState<"tipo" | "filtros">("tipo");
  const [tipo, setTipo] = useState<"movie" | "series" | null>(null);
  const [generosElegidos, setGenerosElegidos] = useState<Set<number>>(new Set());
  const [plataformasDisponibles, setPlataformasDisponibles] = useState<GrupoPlataforma[]>([]);
  const [plataformasElegidas, setPlataformasElegidas] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState(false);
  const [sinResultado, setSinResultado] = useState(false);
  const [ayudaVisible, setAyudaVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      // se resetea al cerrar, para que la próxima vez arranque de cero
      setPaso("tipo");
      setTipo(null);
      setGenerosElegidos(new Set());
      setPlataformasElegidas(new Set());
      setSinResultado(false);
      setAyudaVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    if (tipo) getWatchProvidersDisponibles(tipo, watchRegion).then(setPlataformasDisponibles);
  }, [tipo, watchRegion]);

  function elegirTipo(nuevoTipo: "movie" | "series") {
    setTipo(nuevoTipo);
    setPaso("filtros");
  }

  function toggleGenero(id: number) {
    setGenerosElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function togglePlataforma(clave: string) {
    setPlataformasElegidas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  function mostrarAyuda() {
    setAyudaVisible((v) => !v);
  }

  async function buscar() {
    if (!tipo) return;
    setBuscando(true);
    setSinResultado(false);
    try {
      const idsPlataformas = plataformasDisponibles.filter((p) => plataformasElegidas.has(p.clave)).flatMap((p) => p.provider_ids);
      const resultado =
        props.modo === "chat"
          ? await elegirQueVemos(props.chatId, props.userId, props.otroUserId, tipo, [...generosElegidos], idsPlataformas, watchRegion)
          : await elegirQueVemosGrupo(props.groupId, props.miembroIds, tipo, [...generosElegidos], idsPlataformas, watchRegion);
      if (!resultado) {
        setSinResultado(true);
        return;
      }
      if (props.modo === "chat") {
        await enviarQueVemos(props.chatId, props.userId, resultado.tipo, resultado.tmdbId);
      } else {
        await recomendarEnGrupo({ userId: props.userId, groupId: props.groupId, itemType: resultado.tipo, tmdbId: resultado.tmdbId, esQueVemos: true });
      }
      onEnviado();
      onCerrar();
    } catch (e) {
      console.error("Error al elegir qué ver:", e);
      setSinResultado(true);
    } finally {
      setBuscando(false);
    }
  }

  const generos = tipo === "series" ? GENEROS_SERIES : GENEROS_PELICULAS;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <View style={styles.tituloRow}>
            <View style={{ width: 22 }} />
            <Text style={styles.titulo}>{t("¿Qué vemos?")}</Text>
            <Pressable style={styles.ayudaBoton} onPress={mostrarAyuda} hitSlop={8}>
              <Text style={styles.ayudaBotonTexto}>?</Text>
            </Pressable>
          </View>

          {ayudaVisible && (
            <View style={styles.ayudaCaja}>
              <Text style={styles.ayudaCajaTexto}>
                {props.modo === "chat"
                  ? t("Elegí si buscás película o serie, filtrá por género y plataforma, y Lavinola les recomienda qué ver juntos — prioriza títulos que los dos tengan en pendientes.")
                  : t(
                      "Elegí si buscás película o serie, filtrá por género y plataforma, y Lavinola le recomienda al grupo qué ver juntos — prioriza títulos que los miembros tengan en pendientes."
                    )}
              </Text>
            </View>
          )}

          {paso === "tipo" ? (
            <View style={styles.tipoRow}>
              <Pressable style={styles.tipoBtn} onPress={() => elegirTipo("movie")}>
                <Text style={styles.tipoBtnTexto}>{t("Película")}</Text>
              </Pressable>
              <Pressable style={styles.tipoBtn} onPress={() => elegirTipo("series")}>
                <Text style={styles.tipoBtnTexto}>{t("Serie")}</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={styles.seccionTitulo}>{t("Género")}</Text>
              <View style={styles.chipsWrap}>
                <Pressable style={[styles.chip, generosElegidos.size === 0 && styles.chipActivo]} onPress={() => setGenerosElegidos(new Set())}>
                  <Text style={[styles.chipTexto, generosElegidos.size === 0 && styles.chipTextoActivo]}>{t("Todas")}</Text>
                </Pressable>
                {Object.entries(generos).map(([id, nombre]) => (
                  <Pressable
                    key={id}
                    style={[styles.chip, generosElegidos.has(Number(id)) && styles.chipActivo]}
                    onPress={() => toggleGenero(Number(id))}
                  >
                    <Text style={[styles.chipTexto, generosElegidos.has(Number(id)) && styles.chipTextoActivo]}>{t(nombre)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.seccionTitulo}>{t("Plataforma")}</Text>
              <View style={styles.chipsWrap}>
                <Pressable
                  style={[styles.chip, styles.chipPlataformaTodas, plataformasElegidas.size === 0 && styles.chipActivo]}
                  onPress={() => setPlataformasElegidas(new Set())}
                >
                  <Text style={[styles.chipTexto, plataformasElegidas.size === 0 && styles.chipTextoActivo]}>{t("Todas")}</Text>
                </Pressable>
                {plataformasDisponibles
                  .filter((p) => p.clave !== "otras" && p.logo_path)
                  .map((p) => (
                    <Pressable
                      key={p.clave}
                      onPress={() => togglePlataforma(p.clave)}
                      style={[styles.logoBox, plataformasElegidas.has(p.clave) && styles.logoBoxActivo]}
                    >
                      <Image source={{ uri: posterUrl(p.logo_path!, "w185")! }} style={styles.logoImg} />
                    </Pressable>
                  ))}
              </View>

              {sinResultado && <Text style={styles.sinResultado}>{t("No encontramos nada — probá con menos filtros.")}</Text>}

              <Pressable style={styles.buscarBtn} onPress={buscar} disabled={buscando}>
                {buscando ? <ActivityIndicator color="#000000" /> : <Text style={styles.buscarBtnTexto}>{t("¿Qué vemos?")}</Text>}
              </Pressable>
              <Pressable onPress={() => setPaso("tipo")} style={{ marginTop: 8 }}>
                <Text style={styles.volverTexto}>{t("‹ Elegir película o serie de nuevo")}</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 16 },
  hoja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, width: "100%", maxWidth: 400 },
  tituloRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  titulo: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center", flex: 1 },
  ayudaBoton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ayudaBotonTexto: { color: theme.colors.primaryLight, fontWeight: "800", fontSize: 12 },
  ayudaCaja: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 10, marginBottom: 12 },
  ayudaCajaTexto: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  tipoRow: { flexDirection: "row", gap: 10 },
  tipoBtn: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 18, alignItems: "center" },
  tipoBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 15 },
  seccionTitulo: { fontSize: 11, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", marginTop: 4, marginBottom: 6 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chipPlataformaTodas: { height: 36, justifyContent: "center", paddingVertical: 0 },
  chip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 11.5, color: theme.colors.textMuted, fontWeight: "600" },
  chipTextoActivo: { color: "#000000", fontWeight: "800" },
  logoBox: { width: 36, height: 36, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: theme.colors.surfaceAlt },
  logoBoxActivo: { borderColor: theme.colors.primary },
  logoImg: { width: "100%", height: "100%" },
  sinResultado: { fontSize: 12, color: theme.colors.danger, textAlign: "center", marginTop: 10 },
  buscarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  buscarBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 14 },
  volverTexto: { fontSize: 12, color: theme.colors.primaryLight, textAlign: "center", fontWeight: "600" },
});
