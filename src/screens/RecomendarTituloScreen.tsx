import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, ActivityIndicator, Alert as RNAlert } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { buscarTitulosTolerante, ResultadoTitulo } from "../lib/tituloSearch";
import { recomendarEnGrupo } from "../lib/comments";
import { enviarRecomendacionAUsuario } from "../lib/chats";
import { posterUrl } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: {
    params: {
      destinoTipo: "grupo" | "chat";
      groupId?: string;
      chatId?: string;
    };
  };
  navigation: any;
}

export default function RecomendarTituloScreen({ route, navigation }: Props) {
  const { destinoTipo, groupId, chatId } = route.params;
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoTitulo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<ResultadoTitulo | null>(null);
  const [nota, setNota] = useState("");
  const [esSpoiler, setEsSpoiler] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: t("Recomendar"),
      headerRight: () => (
        <Pressable onPress={mostrarAyuda} hitSlop={10} style={{ marginRight: 12 }}>
          <Ionicons name="help-circle-outline" size={24} color={theme.colors.text} />
        </Pressable>
      ),
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const idTimeout = setTimeout(() => {
      buscarTitulosTolerante(query, () => vigente)
        .then((r) => vigente && setResultados(r))
        .catch((e) => console.error("Error al buscar títulos para recomendar:", e))
        .finally(() => vigente && setBuscando(false));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(idTimeout);
    };
  }, [query]);

  function mostrarAyuda() {
    RNAlert.alert(
      t("¿Qué es esto?"),
      t("Elegí una película o serie y se la recomendás directo acá — al grupo, o a esta persona — con una notita si querés, igual que cuando compartís un título desde su pantalla de detalle.")
    );
  }

  async function enviar() {
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId || !elegido) return;

      if (destinoTipo === "grupo" && groupId) {
        await recomendarEnGrupo({
          userId,
          groupId,
          nota: nota.trim() || null,
          hasSpoiler: esSpoiler,
          itemType: elegido.tipo,
          tmdbId: elegido.id,
        });
      } else if (destinoTipo === "chat" && chatId) {
        await enviarRecomendacionAUsuario(chatId, userId, elegido.tipo, elegido.id, nota.trim() || null, null, null, esSpoiler);
      }
      navigation.goBack();
    } catch (e: any) {
      console.error("Error al recomendar título:", e);
      Alert.alert(t("No se pudo enviar"), e.message ?? "");
    } finally {
      setEnviando(false);
    }
  }

  if (elegido) {
    return (
      <View style={styles.container}>
        <View style={styles.tituloRow}>
          {elegido.poster_path ? (
            <Image source={{ uri: posterUrl(elegido.poster_path, "w185")! }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.tituloNombre} numberOfLines={2}>
              {elegido.titulo}
            </Text>
            {elegido.anio && <Text style={styles.subtitulo}>{elegido.anio}</Text>}
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder={t("¿Querés agregar algo? (opcional)")}
          placeholderTextColor={theme.colors.textFaint}
          value={nota}
          onChangeText={setNota}
          multiline
          maxLength={500}
        />

        <Pressable style={styles.spoilerRow} onPress={() => setEsSpoiler(!esSpoiler)}>
          <View style={[styles.checkbox, esSpoiler && styles.checkboxActivo]}>{esSpoiler && <Text style={styles.checkboxTilde}>✓</Text>}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.spoilerLabel}>{t("¿Tiene spoiler?")}</Text>
            <Text style={styles.spoilerHint}>{t('Si decís que sí, tu mensaje aparece oculto hasta que alguien toque "Ver".')}</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => setElegido(null)} style={{ marginTop: 16 }}>
          <Text style={styles.cambiarTexto}>{t("Elegir otro título")}</Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <AppButton title={enviando ? t("Enviando...") : t("Recomendar")} onPress={enviar} disabled={enviando} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.buscadorWrap}>
        <Ionicons name="search" size={16} color={theme.colors.textFaint} />
        <TextInput
          style={styles.buscador}
          placeholder={t("Buscar película o serie...")}
          placeholderTextColor={theme.colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>
      {buscando ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={resultados}
          keyExtractor={(r) => `${r.tipo}-${r.id}`}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={query.trim() ? <Text style={styles.vacio}>{t("No encontramos nada con ese nombre.")}</Text> : null}
          renderItem={({ item }) => (
            <Pressable style={styles.fila} onPress={() => setElegido(item)}>
              {item.poster_path ? (
                <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />
              ) : (
                <View style={[styles.poster, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre} numberOfLines={2}>
                  {item.titulo}
                </Text>
                {item.anio && <Text style={styles.subtitulo}>{item.anio}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 12 },
  buscadorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  buscador: { flex: 1, color: theme.colors.text, paddingVertical: 10, fontSize: 14 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },
  poster: { width: 46, height: 69, borderRadius: 6 },
  nombre: { fontSize: 14, fontWeight: "600" },
  subtitulo: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  tituloRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 8, marginBottom: 16, gap: 10 },
  tituloNombre: { fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 100,
    lineHeight: 20,
    textAlignVertical: "top",
    fontSize: 15,
  },
  spoilerRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 16, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTilde: { color: "#000000", fontWeight: "800", fontSize: 13 },
  spoilerLabel: { fontSize: 14, fontWeight: "700" },
  spoilerHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  cambiarTexto: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700", textAlign: "center" },
});
