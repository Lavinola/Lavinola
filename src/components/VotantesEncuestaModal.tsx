import React, { useEffect, useState } from "react";
import { View, Modal, ScrollView, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { listarVotantesDeOpcion, VotanteDeOpcion } from "../lib/polls";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const POR_PAGINA = 5;

interface OpcionParaVotantes {
  id: string;
  etiqueta: string; // texto de la opción, o el nombre del título si no tenía texto propio
  votos: number;
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  navigation?: any;
  opciones: OpcionParaVotantes[];
}

interface EstadoOpcion {
  votantes: VotanteDeOpcion[];
  offset: number;
  hayMas: boolean;
  cargando: boolean;
}

export default function VotantesEncuestaModal({ visible, onCerrar, navigation, opciones }: Props) {
  const { t } = useT();
  const [estados, setEstados] = useState<Record<string, EstadoOpcion>>({});

  const ordenadas = [...opciones].sort((a, b) => b.votos - a.votos);

  useEffect(() => {
    if (!visible) {
      setEstados({});
      return;
    }
    ordenadas.forEach((o) => {
      if (o.votos > 0) cargarMas(o.id, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function cargarMas(optionId: string, esInicial = false) {
    const actual = estados[optionId] ?? { votantes: [], offset: 0, hayMas: true, cargando: false };
    if (actual.cargando || (!esInicial && !actual.hayMas)) return;
    setEstados((prev) => ({ ...prev, [optionId]: { ...actual, cargando: true } }));
    try {
      const nuevos = await listarVotantesDeOpcion(optionId, actual.offset, POR_PAGINA);
      setEstados((prev) => ({
        ...prev,
        [optionId]: {
          votantes: [...actual.votantes, ...nuevos],
          offset: actual.offset + nuevos.length,
          hayMas: nuevos.length === POR_PAGINA,
          cargando: false,
        },
      }));
    } catch (e) {
      console.error("Error al cargar votantes:", e);
      setEstados((prev) => ({ ...prev, [optionId]: { ...actual, cargando: false } }));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitulo}>{t("Votos")}</Text>
            <Pressable onPress={onCerrar} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView>
            {ordenadas.map((o) => {
              const estado = estados[o.id];
              return (
                <View key={o.id} style={styles.opcionSeccion}>
                  <View style={styles.opcionEncabezado}>
                    <Text style={styles.opcionTexto} numberOfLines={2}>
                      {o.etiqueta}
                    </Text>
                    <Text style={styles.opcionVotos}>{o.votos}</Text>
                  </View>
                  {o.votos === 0 ? (
                    <Text style={styles.sinVotos}>{t("Nadie votó esta opción todavía.")}</Text>
                  ) : (
                    <>
                      {(estado?.votantes ?? []).map((v) => (
                        <Pressable
                          key={v.user_id}
                          style={styles.votanteFila}
                          onPress={() => {
                            onCerrar();
                            navigation?.navigate("PerfilAjeno", { userId: v.user_id });
                          }}
                        >
                          {v.avatar_url ? (
                            <Image source={{ uri: v.avatar_url }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, styles.avatarVacio]} />
                          )}
                          <Text style={styles.votanteTexto}>{v.username ?? t("Usuario")}</Text>
                        </Pressable>
                      ))}
                      {estado?.cargando && <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />}
                      {estado?.hayMas && !estado.cargando && (
                        <Pressable onPress={() => cargarMas(o.id)} style={styles.mostrarMasBtn}>
                          <Text style={styles.mostrarMasTexto}>{t("Mostrar más")}</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, maxHeight: "80%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerTitulo: { fontSize: 16, fontWeight: "700" },
  opcionSeccion: { marginBottom: 18 },
  opcionEncabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 },
  opcionTexto: { flex: 1, fontSize: 14, fontWeight: "700" },
  opcionVotos: { fontSize: 14, fontWeight: "700", color: theme.colors.primaryLight },
  sinVotos: { fontSize: 12, color: theme.colors.textMuted },
  votanteFila: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarVacio: { backgroundColor: theme.colors.surfaceAlt },
  votanteTexto: { fontSize: 13 },
  mostrarMasBtn: { alignSelf: "flex-start", marginTop: 4 },
  mostrarMasTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
});
