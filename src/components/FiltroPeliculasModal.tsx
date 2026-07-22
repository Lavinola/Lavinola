import React, { useState, useEffect } from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, AppButton } from "./Themed";
import { GENEROS_PELICULAS } from "../lib/tmdbGenres";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export type OrdenPeliculas = "personalizado" | "añadida" | "vista" | "alfabetico" | "tu_puntuacion" | "lanzamiento";
export type FiltroEstadoPelicula = "todo" | "vista" | "no_vista";

const OPCIONES_ORDEN: { key: OrdenPeliculas; label: string }[] = [
  { key: "añadida", label: "Últimas añadidas" },
  { key: "vista", label: "Últimas vistas" },
];

const OPCIONES_ESTADO: { key: FiltroEstadoPelicula; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "vista", label: "Vista" },
  { key: "no_vista", label: "No vista" },
];

interface Props {
  visible: boolean;
  onCerrar: () => void;
  ordenActual: OrdenPeliculas;
  ascendenteActual: boolean;
  filtroActual: FiltroEstadoPelicula;
  generoActual: number | null;
  mostrarOrdenPropio?: boolean;
  mostrarEstado?: boolean;
  soloOpcionesBasicas?: boolean; // al ver el perfil de otro usuario: solo personalizado/alfabético/lanzamiento — el resto no tiene sentido fuera de tu propia cuenta
  onAplicar: (orden: OrdenPeliculas, filtro: FiltroEstadoPelicula, ascendente: boolean, generoId: number | null) => void;
}

export default function FiltroPeliculasModal({
  visible,
  onCerrar,
  ordenActual,
  ascendenteActual,
  filtroActual,
  generoActual,
  mostrarOrdenPropio,
  mostrarEstado = true,
  soloOpcionesBasicas,
  onAplicar,
}: Props) {
  const { t } = useT();
  const [orden, setOrden] = useState<OrdenPeliculas>(ordenActual);
  const [ascendente, setAscendente] = useState(ascendenteActual);
  const [filtro, setFiltro] = useState<FiltroEstadoPelicula>(filtroActual);
  const [generoId, setGeneroId] = useState<number | null>(generoActual);

  useEffect(() => {
    if (visible) {
      setOrden(ordenActual);
      setAscendente(ascendenteActual);
      setFiltro(filtroActual);
      setGeneroId(generoActual);
    }
  }, [visible]);

  function elegirPuntuacion() {
    if (orden === "tu_puntuacion") setAscendente(!ascendente);
    else {
      setOrden("tu_puntuacion");
      setAscendente(false);
      setFiltro("vista");
    }
  }

  function elegirLanzamiento() {
    if (orden === "lanzamiento") setAscendente(!ascendente);
    else {
      setOrden("lanzamiento");
      setAscendente(false);
    }
  }

  function elegirAlfabetico() {
    if (orden === "alfabetico") setAscendente(!ascendente);
    else {
      setOrden("alfabetico");
      setAscendente(true);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <ScrollView bounces={false}>
            <Text style={styles.titulo}>{t("Ordenar por")}</Text>
            <View style={styles.pillsRow}>
              {mostrarOrdenPropio && (
                <Pressable style={[styles.pill, orden === "personalizado" && styles.pillActivo]} onPress={() => setOrden("personalizado")}>
                  <Text style={[styles.pillTexto, orden === "personalizado" && styles.pillTextoActivo]}>{t("Orden personalizado")}</Text>
                </Pressable>
              )}
              {!soloOpcionesBasicas &&
                OPCIONES_ORDEN.map((o) => (
                  <Pressable key={o.key} style={[styles.pill, orden === o.key && styles.pillActivo]} onPress={() => setOrden(o.key)}>
                    <Text style={[styles.pillTexto, orden === o.key && styles.pillTextoActivo]}>{t(o.label)}</Text>
                  </Pressable>
                ))}
              <Pressable style={[styles.pill, styles.pillPuntuacion, orden === "alfabetico" && styles.pillActivo]} onPress={elegirAlfabetico}>
                <Text style={[styles.pillTexto, orden === "alfabetico" && styles.pillTextoActivo]}>{t("Alfabético")}</Text>
                {orden === "alfabetico" && (
                  <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={13} color="#000000" style={{ marginLeft: 4 }} />
                )}
              </Pressable>
              <Pressable style={[styles.pill, styles.pillPuntuacion, orden === "lanzamiento" && styles.pillActivo]} onPress={elegirLanzamiento}>
                <Text style={[styles.pillTexto, orden === "lanzamiento" && styles.pillTextoActivo]}>{t("Fecha de lanzamiento")}</Text>
                {orden === "lanzamiento" && (
                  <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={13} color="#000000" style={{ marginLeft: 4 }} />
                )}
              </Pressable>
              {!soloOpcionesBasicas && (
                <Pressable style={[styles.pill, styles.pillPuntuacion, orden === "tu_puntuacion" && styles.pillActivo]} onPress={elegirPuntuacion}>
                  <Text style={[styles.pillTexto, orden === "tu_puntuacion" && styles.pillTextoActivo]}>{t("Tu")}</Text>
                  <Ionicons name="star" size={13} color={orden === "tu_puntuacion" ? "#000000" : theme.colors.primaryLight} style={{ marginLeft: 4 }} />
                  {orden === "tu_puntuacion" && (
                    <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={13} color="#000000" style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              )}
            </View>

            {mostrarEstado && (
              <>
                <Text style={styles.titulo}>{t("Estado")}</Text>
                {OPCIONES_ESTADO.map((o) => (
                  <Pressable key={o.key} style={styles.filaEstado} onPress={() => setFiltro(o.key)}>
                    <Text style={styles.filaEstadoTexto}>{t(o.label)}</Text>
                    <View style={[styles.circulo, filtro === o.key && styles.circuloActivo]}>
                      {filtro === o.key && <Text style={styles.circuloTilde}>✓</Text>}
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={styles.titulo}>{t("Género")}</Text>
            <View style={styles.pillsRow}>
              <Pressable style={[styles.pillChico, generoId === null && styles.pillActivo]} onPress={() => setGeneroId(null)}>
                <Text style={[styles.pillTextoChico, generoId === null && styles.pillTextoActivo]}>{t("Todos")}</Text>
              </Pressable>
              {Object.entries(GENEROS_PELICULAS).map(([id, nombre]) => (
                <Pressable key={id} style={[styles.pillChico, generoId === Number(id) && styles.pillActivo]} onPress={() => setGeneroId(Number(id))}>
                  <Text style={[styles.pillTextoChico, generoId === Number(id) && styles.pillTextoActivo]}>{t(nombre)}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <AppButton
                title={t("Restablecer")}
                variant="outline"
                onPress={() => {
                  setOrden(mostrarOrdenPropio ? "personalizado" : soloOpcionesBasicas ? "alfabetico" : "añadida");
                  setAscendente(false);
                  setFiltro("todo");
                  setGeneroId(null);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                title={t("Aplicar")}
                onPress={() => {
                  onAplicar(orden, filtro, ascendente, generoId);
                  onCerrar();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20, maxHeight: "80%" },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 12, marginTop: 8 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pill: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 16 },
  pillActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pillTexto: { fontSize: 13, color: theme.colors.textMuted },
  pillTextoActivo: { color: "#000000", fontWeight: "700" },
  filaEstado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaEstadoTexto: { fontSize: 15 },
  circulo: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  circuloActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  circuloTilde: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  footer: { flexDirection: "row", marginTop: 16 },
  pillPuntuacion: { flexDirection: "row", alignItems: "center" },
  pillChico: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  pillTextoChico: { fontSize: 11, color: theme.colors.textMuted },
});
