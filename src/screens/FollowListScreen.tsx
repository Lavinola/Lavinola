import React, { useEffect, useMemo, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alert";
import { Text } from "../components/Themed";
import NombreUsuario from "../components/NombreUsuario";
import EstadoVacio from "../components/EstadoVacio";
import Avatar from "../components/Avatar";
import { SkeletonListRows } from "../components/SkeletonShapes";
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
  const [busqueda, setBusqueda] = useState("");
  const [ordenReciente, setOrdenReciente] = useState(false); // solo aplica a tu propia lista; default alfabético

  const esMiPropiaLista = !!viewerId && viewerId === userId;

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

  const listaFinal = useMemo(() => {
    let resultado = [...lista];

    // Búsqueda por nombre de usuario o nombre para mostrar, siempre disponible.
    const texto = busqueda.trim().toLowerCase();
    if (texto.length > 0) {
      resultado = resultado.filter((u) => (u.username ?? "").toLowerCase().includes(texto) || (u.display_name ?? "").toLowerCase().includes(texto));
    }

    if (esMiPropiaLista) {
      // Tu propia lista: alfabético por default, o más reciente primero si se activa el toggle.
      if (ordenReciente) {
        resultado.sort((a, b) => (b.followCreatedAt ?? "").localeCompare(a.followCreatedAt ?? ""));
      } else {
        resultado.sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
      }
    } else {
      // Lista de otro usuario: primero la gente que vos también seguís, después el resto — alfabético dentro de cada grupo.
      resultado.sort((a, b) => {
        if (a.siguiendo !== b.siguiendo) return a.siguiendo ? -1 : 1;
        return (a.username ?? "").localeCompare(b.username ?? "");
      });
    }

    return resultado;
  }, [lista, busqueda, esMiPropiaLista, ordenReciente]);

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
      <View style={styles.topBar}>
        <View style={styles.buscadorConLupa}>
          <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
          <TextInput
            style={styles.input}
            placeholder={t("Buscar por usuario...")}
            placeholderTextColor={theme.colors.textFaint}
            value={busqueda}
            onChangeText={setBusqueda}
            autoComplete="off"
            autoCorrect={false}
          />
        </View>
        {esMiPropiaLista && (
          <Pressable style={styles.ordenBtn} onPress={() => setOrdenReciente((v) => !v)} hitSlop={8}>
            {ordenReciente && <Ionicons name="time" size={14} color={theme.colors.primaryLight} />}
            <Text style={styles.ordenBtnTexto}>{ordenReciente ? t("Recientes") : t("A-Z")}</Text>
          </Pressable>
        )}
      </View>

      {cargando ? (
        <SkeletonListRows />
      ) : (
      <FlatList
        data={listaFinal}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EstadoVacio
            icono={busqueda.trim().length > 0 ? "search-outline" : "person-outline"}
            titulo={
              busqueda.trim().length > 0
                ? t("No encontramos a nadie con ese nombre.")
                : modo === "siguiendo"
                ? t("Todavía no sigue a nadie.")
                : t("Todavía no tiene seguidores.")
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.push("PerfilAjeno", { userId: item.id })}>
            <Avatar uri={item.avatar_url} size={40} style={{ marginRight: 10 }} />
            <NombreUsuario style={styles.username} displayName={item.display_name} username={item.username} numberOfLines={1} />
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
      )}
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
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  buscadorConLupa: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
  },
  input: { flex: 1, color: theme.colors.text, paddingVertical: 8, fontSize: 13, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },
  ordenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ordenBtnTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
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
