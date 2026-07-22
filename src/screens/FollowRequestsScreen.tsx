import React, { useCallback, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import {
  listarSolicitudesPendientes,
  aceptarSolicitud,
  rechazarSolicitud,
  seguirRespetandoPrivacidad,
  tengoSolicitudPendiente,
  SolicitudPendiente,
} from "../lib/followRequests";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type EstadoFila = "pendiente" | "aceptada_sin_seguir" | "aceptada_solicitado" | "aceptada_siguiendo";

export default function FollowRequestsScreen({ navigation }: any) {
  const { t } = useT();
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const lista = await listarSolicitudesPendientes(uid);
    setSolicitudes(lista);
    setEstados((prev) => {
      // Mantenemos el estado de las que ya venían de antes (por si el
      // usuario ya había aceptado alguna en esta misma visita) y arrancamos
      // "pendiente" las nuevas.
      const copia: Record<string, EstadoFila> = {};
      lista.forEach((s) => (copia[s.id] = prev[s.id] ?? "pendiente"));
      return copia;
    });
  }

  async function aceptar(s: SolicitudPendiente) {
    if (!userId) return;
    await aceptarSolicitud(s, userId);
    // Ya lo sigo de antes (por ejemplo, si me había dejado de seguir y volvió a pedir)?
    const { data: yaSigo } = await supabase.from("follows").select("follower_id").eq("follower_id", userId).eq("followee_id", s.requester_id).maybeSingle();
    if (yaSigo) {
      setEstados((prev) => ({ ...prev, [s.id]: "aceptada_siguiendo" }));
      return;
    }
    const solicitudEnviada = await tengoSolicitudPendiente(userId, s.requester_id);
    setEstados((prev) => ({ ...prev, [s.id]: solicitudEnviada ? "aceptada_solicitado" : "aceptada_sin_seguir" }));
  }

  async function rechazar(s: SolicitudPendiente) {
    await rechazarSolicitud(s.id);
    setSolicitudes((prev) => prev.filter((x) => x.id !== s.id));
  }

  async function seguirDeVuelta(s: SolicitudPendiente) {
    if (!userId) return;
    const resultado = await seguirRespetandoPrivacidad(userId, s.requester_id);
    if (resultado === "seguido") {
      // Ya nos seguimos mutuamente — recién ahí sí desaparece la solicitud de esta pantalla.
      setSolicitudes((prev) => prev.filter((x) => x.id !== s.id));
    } else {
      setEstados((prev) => ({ ...prev, [s.id]: "aceptada_solicitado" }));
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      data={solicitudes}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 12 }}
      ListEmptyComponent={<Text style={styles.vacio}>{t("No tenés solicitudes pendientes.")}</Text>}
      renderItem={({ item }) => {
        const estado = estados[item.id] ?? "pendiente";
        return (
          <View style={styles.card}>
            <Pressable onPress={() => navigation.navigate("PerfilAjeno", { userId: item.requester_id })}>
              <Text style={styles.nombre}>{item.requester_username ?? t("Usuario")}</Text>
            </Pressable>
            {estado === "pendiente" ? (
              <View style={styles.botones}>
                <AppButton title={t("Aceptar")} onPress={() => aceptar(item)} />
                <View style={{ width: 8 }} />
                <AppButton title={t("Rechazar")} variant="muted" onPress={() => rechazar(item)} />
              </View>
            ) : estado === "aceptada_siguiendo" ? (
              <Text style={styles.yaAceptada}>{t("Se siguen mutuamente")}</Text>
            ) : (
              <View style={styles.botones}>
                <AppButton
                  title={estado === "aceptada_solicitado" ? t("Solicitud enviada") : t("Seguir")}
                  variant={estado === "aceptada_solicitado" ? "muted" : "primary"}
                  disabled={estado === "aceptada_solicitado"}
                  onPress={() => seguirDeVuelta(item)}
                />
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  nombre: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  botones: { flexDirection: "row" },
  yaAceptada: { fontSize: 13, color: theme.colors.textMuted },
});
