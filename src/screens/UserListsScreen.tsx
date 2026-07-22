import React, { useEffect, useState } from "react";
import { View, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { listarListasDeUsuarioOrdenadasPorSeguidores, seguirLista, dejarDeSeguirLista, sigoLista, Lista } from "../lib/lists";
import ListPreviewCard from "../components/ListPreviewCard";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function UserListsScreen({ route, navigation }: any) {
  const { t } = useT();
  const { userId: targetId, username } = route.params;
  const [listas, setListas] = useState<Lista[]>([]);
  const [listasSeguidas, setListasSeguidas] = useState<Set<string>>(new Set());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: username ? `@${username}` : t("Listas") });
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const vid = userData.user?.id ?? null;
    setViewerId(vid);
    const todas = await listarListasDeUsuarioOrdenadasPorSeguidores(targetId);
    setListas(todas);
    if (vid && vid !== targetId) {
      const seguidas = await Promise.all(todas.map(async (l) => ((await sigoLista(vid, l.id)) ? l.id : null)));
      setListasSeguidas(new Set(seguidas.filter(Boolean) as string[]));
    }
    setLoading(false);
  }

  async function toggleSeguir(lista: Lista) {
    if (!viewerId) return;
    const yaSigo = listasSeguidas.has(lista.id);
    if (yaSigo) {
      await dejarDeSeguirLista(viewerId, lista.id);
      setListasSeguidas((prev) => {
        const copia = new Set(prev);
        copia.delete(lista.id);
        return copia;
      });
    } else {
      await seguirLista(viewerId, lista.id);
      setListasSeguidas((prev) => new Set(prev).add(lista.id));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={listas}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía no hay listas para ver acá.")}</Text>}
        renderItem={({ item }) => (
          <ListPreviewCard
            lista={item}
            onPress={() => navigation.navigate("DetalleLista", { listId: item.id, listTitle: item.title, soloLectura: true })}
            subtitulo={[`${item.cantidad} ${t("títulos")}`, item.seguidores ? `${item.seguidores} ${t("seguidores")}` : null].filter(Boolean).join(" · ")}
            accionesDerecha={
              viewerId && viewerId !== targetId ? (
                <Pressable onPress={() => toggleSeguir(item)} hitSlop={8}>
                  <Text style={styles.listaSeguir}>{listasSeguidas.has(item.id) ? t("Siguiendo") : t("Seguir")}</Text>
                </Pressable>
              ) : undefined
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  listaSeguir: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
});
