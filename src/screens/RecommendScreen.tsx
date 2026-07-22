import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { usuariosMutuos, UsuarioBasico } from "../lib/follows";
import { listarMisGrupos, Grupo } from "../lib/groups";
import { obtenerOCrearChat, enviarRecomendacionAUsuario, enviarRecomendacionDeGrupoAUsuario, enviarRecomendacionDeListaAUsuario } from "../lib/chats";
import { recomendarEnGrupo } from "../lib/comments";
import { posterUrl } from "../lib/tmdb";
import { Text } from "../components/Themed";
import UnderlineTabs from "../components/UnderlineTabs";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Tab = "usuarios" | "grupos";

interface Props {
  route: {
    params: {
      kind: "title" | "group" | "list"; // qué se está recomendando
      itemType?: "series" | "movie" | "episode";
      tmdbId?: number;
      seasonNumber?: number;
      episodeNumber?: number;
      groupId?: string; // si kind === "group", el grupo que se recomienda
      listId?: string; // si kind === "list", la lista que se recomienda
      nombre: string;
      posterPath?: string | null;
    };
  };
  navigation: any;
}

export default function RecommendScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { kind, itemType, tmdbId, seasonNumber, episodeNumber, groupId, listId, nombre, posterPath } = route.params;
  const [tab, setTab] = useState<Tab>("usuarios");
  const [userId, setUserId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoA, setEnviadoA] = useState<Set<string>>(new Set());
  const [busquedaUsuarios, setBusquedaUsuarios] = useState("");
  const [busquedaGrupos, setBusquedaGrupos] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (uid) {
      const [u, g] = await Promise.all([usuariosMutuos(uid), listarMisGrupos(uid)]);
      setUsuarios(u);
      // No tiene sentido recomendarle un grupo a sí mismo.
      setGrupos(kind === "group" ? g.filter((gr) => gr.id !== groupId) : g);
    }
    setLoading(false);
  }

  function abrirCompositor(id: string) {
    setExpandidoId(expandidoId === id ? null : id);
    setNota("");
  }

  async function enviarAUsuario(u: UsuarioBasico) {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setUserId(uid);
    }
    if (!uid) {
      Alert.alert("No se pudo enviar", "No pudimos confirmar tu sesión. Cerrá esta pantalla y volvé a intentar.");
      return;
    }
    setEnviando(true);
    try {
      const chatId = await obtenerOCrearChat(u.id);
      if (kind === "title" && itemType && tmdbId) {
        await enviarRecomendacionAUsuario(chatId, uid, itemType, tmdbId, nota, seasonNumber, episodeNumber);
      } else if (kind === "group" && groupId) {
        await enviarRecomendacionDeGrupoAUsuario(chatId, uid, groupId, nota);
      } else if (kind === "list" && listId) {
        await enviarRecomendacionDeListaAUsuario(chatId, uid, listId, nota);
      }
      setEnviadoA((prev) => new Set(prev).add(u.id));
      setExpandidoId(null);
      setNota("");
    } catch (e: any) {
      console.error("Error al recomendar a usuario:", e);
      Alert.alert("No se pudo enviar", e.message ?? "Ocurrió un error inesperado. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarAGrupo(g: Grupo) {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setUserId(uid);
    }
    if (!uid) {
      Alert.alert("No se pudo enviar", "No pudimos confirmar tu sesión. Cerrá esta pantalla y volvé a intentar.");
      return;
    }
    setEnviando(true);
    try {
      await recomendarEnGrupo({
        userId: uid,
        groupId: g.id,
        nota,
        itemType: kind === "title" ? itemType : undefined,
        tmdbId: kind === "title" ? tmdbId : undefined,
        seasonNumber: kind === "title" ? seasonNumber : undefined,
        episodeNumber: kind === "title" ? episodeNumber : undefined,
        recomendarGroupId: kind === "group" ? groupId : undefined,
        recomendarListaId: kind === "list" ? listId : undefined,
      });
      setEnviadoA((prev) => new Set(prev).add(g.id));
      setExpandidoId(null);
      setNota("");
    } catch (e: any) {
      console.error("Error al recomendar en grupo:", e);
      Alert.alert("No se pudo enviar", e.message ?? "Ocurrió un error inesperado. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const usuariosFiltrados = busquedaUsuarios.trim()
    ? usuarios.filter((u) => (u.username ?? "").toLowerCase().includes(busquedaUsuarios.trim().toLowerCase()))
    : usuarios;
  const gruposFiltrados = busquedaGrupos.trim()
    ? grupos.filter((g) => g.name.toLowerCase().includes(busquedaGrupos.trim().toLowerCase()))
    : grupos;

  return (
    <View style={styles.container}>
      <View style={styles.tituloBox}>
        {posterPath && <Image source={{ uri: kind === "group" ? posterPath : posterUrl(posterPath, "w185")! }} style={styles.poster} />}
        <Text style={styles.titulo}>{t('Recomendar "{nombre}"').replace("{nombre}", nombre)}</Text>
      </View>

      <UnderlineTabs
        opciones={[
          { key: "usuarios", label: t("Usuarios") },
          { key: "grupos", label: t("Grupos") },
        ]}
        valor={tab}
        onCambiar={(v) => setTab(v as Tab)}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : tab === "usuarios" ? (
        <FlatList
          data={usuariosFiltrados}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={
            <TextInput
              style={styles.buscador}
              placeholder={t("Buscar por usuario...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busquedaUsuarios}
              onChangeText={setBusquedaUsuarios}
            />
          }
          ListEmptyComponent={<Text style={styles.vacio}>{t("Solo podés recomendarle a gente que te sigue Y que vos seguís.")}</Text>}
          renderItem={({ item }) => (
            <View>
              <View style={styles.card}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <Text style={styles.username}>{item.username ?? t("Usuario")}</Text>
                <Pressable style={styles.recomendarBtn} onPress={() => abrirCompositor(item.id)} disabled={enviadoA.has(item.id)}>
                  <Text style={styles.recomendarBtnTexto}>{enviadoA.has(item.id) ? t("Enviado ✓") : t("Recomendar")}</Text>
                </Pressable>
              </View>
              {expandidoId === item.id && (
                <View style={styles.compositorRow}>
                  <TextInput
                    style={styles.compositorInput}
                    placeholder={t("Mensaje opcional...")}
                    placeholderTextColor={theme.colors.textFaint}
                    value={nota}
                    onChangeText={setNota}
                    maxLength={200}
                  />
                  <Pressable style={styles.enviarBtn} onPress={() => enviarAUsuario(item)} disabled={enviando}>
                    <Ionicons name="paper-plane" size={18} color="#000000" />
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={gruposFiltrados}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={
            <TextInput
              style={styles.buscador}
              placeholder={t("Buscar grupo...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busquedaGrupos}
              onChangeText={setBusquedaGrupos}
            />
          }
          ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía no sos parte de ningún grupo.")}</Text>}
          renderItem={({ item }) => (
            <View>
              <View style={styles.card}>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <Text style={styles.username}>{item.name}</Text>
                <Pressable style={styles.recomendarBtn} onPress={() => abrirCompositor(item.id)} disabled={enviadoA.has(item.id)}>
                  <Text style={styles.recomendarBtnTexto}>{enviadoA.has(item.id) ? t("Enviado ✓") : t("Recomendar")}</Text>
                </Pressable>
              </View>
              {expandidoId === item.id && (
                <View style={styles.compositorRow}>
                  <TextInput
                    style={styles.compositorInput}
                    placeholder={t("Mensaje opcional...")}
                    placeholderTextColor={theme.colors.textFaint}
                    value={nota}
                    onChangeText={setNota}
                    maxLength={200}
                  />
                  <Pressable style={styles.enviarBtn} onPress={() => enviarAGrupo(item)} disabled={enviando}>
                    <Ionicons name="paper-plane" size={18} color="#000000" />
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  tituloBox: { flexDirection: "row", alignItems: "center", padding: 12 },
  poster: { width: 32, height: 48, borderRadius: 4, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  titulo: { fontSize: 15, fontWeight: "700", flex: 1 },
  tabsRectRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  tabRect: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: "#000000", borderWidth: 1, borderColor: "transparent" },
  tabRectActivo: { borderColor: theme.colors.primary },
  tabRectTexto: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  buscador: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 8, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { flex: 1, fontSize: 15 },
  recomendarBtn: { backgroundColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  recomendarBtnTexto: { color: "#000000", fontSize: 12, fontWeight: "700" },
  compositorRow: { flexDirection: "row", alignItems: "center", paddingBottom: 10, gap: 8 },
  compositorInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 8 },
  enviarBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
});
