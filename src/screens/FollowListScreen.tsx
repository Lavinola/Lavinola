import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { usuariosQueSigo, seguidoresDe, dejarDeSeguir, UsuarioBasico } from "../lib/follows";
import { seguirRespetandoPrivacidad } from "../lib/followRequests";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { userId: string; modo: "siguiendo" | "seguidores" } };
  navigation: any;
}

export default function FollowListScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { userId, modo } = route.params;
  const [lista, setLista] = useState<UsuarioBasico[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aDejarDeSeguir, setADejarDeSeguir] = useState<UsuarioBasico | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: modo === "siguiendo" ? t("Siguiendo") : t("Seguidores") });
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setViewerId(uid);
    const data = modo === "siguiendo" ? await usuariosQueSigo(userId, uid) : await seguidoresDe(userId, uid);
    setLista(data);
    setCargando(false);
  }

  async function toggleFollow(u: UsuarioBasico) {
    if (!viewerId || u.solicitudPendiente) return;
    if (u.siguiendo) {
      setADejarDeSeguir(u);
      return;
    }
    try {
      await seguirRespetandoPrivacidad(viewerId, u.id);
      cargar();
    } catch (e: any) {
      Alert.alert(t("No se pudo seguir"), e.message);
    }
  }

  async function confirmarDejarDeSeguir() {
    if (!viewerId || !aDejarDeSeguir) return;
    await dejarDeSeguir(viewerId, aDejarDeSeguir.id);
    setADejarDeSeguir(null);
    cargar();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={lista}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          !cargando ? (
            <Text style={styles.vacio}>
              {modo === "siguiendo" ? t("Todavía no sigue a nadie.") : t("Todavía no tiene seguidores.")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <Text style={styles.username}>{item.username ?? "Usuario"}</Text>
            {viewerId && viewerId !== item.id && (
              <Pressable
                style={[styles.followBtn, (item.siguiendo || item.solicitudPendiente) && styles.followBtnActivo]}
                onPress={() => toggleFollow(item)}
                disabled={item.solicitudPendiente}
              >
                <Text style={[styles.followBtnText, (item.siguiendo || item.solicitudPendiente) && styles.followBtnTextActivo]}>
                  {item.solicitudPendiente ? t("Solicitud enviada") : item.siguiendo ? t("Siguiendo") : t("Seguir")}
                </Text>
              </Pressable>
            )}
          </Pressable>
        )}
      />

      <ConfirmModal
        visible={!!aDejarDeSeguir}
        onCerrar={() => setADejarDeSeguir(null)}
        titulo={t("Dejar de seguir")}
        mensaje={t("¿Seguro que querés dejar de seguir a {nombre}?").replace("{nombre}", aDejarDeSeguir?.username ?? t("este usuario"))}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Dejar de seguir"), destacado: true, onPress: confirmarDejarDeSeguir },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { flex: 1, fontSize: 15 },
  followBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  followBtnText: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  followBtnActivo: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  followBtnTextActivo: { color: theme.colors.textMuted },
});
