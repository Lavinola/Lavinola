import React, { useEffect, useState } from "react";
import { View, FlatList, TextInput, Pressable, StyleSheet } from "react-native";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Lista {
  id: string;
  title: string;
}

export default function ChooseListScreen({ route, navigation }: any) {
  const { t } = useT();
  const { itemType, tmdbId } = route.params;
  const [listas, setListas] = useState<Lista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const { data } = await supabase.from("lists").select("id, title").eq("user_id", uid).order("created_at", { ascending: false });
    setListas(data ?? []);
  }

  async function agregarA(listId: string) {
    const { error } = await supabase.from("list_items").upsert({ list_id: listId, item_type: itemType, tmdb_id: tmdbId });
    if (error) {
      Alert.alert("No se pudo agregar", error.message);
      return;
    }
    navigation.goBack();
  }

  const listasFiltradas = busqueda.trim() ? listas.filter((l) => l.title.toLowerCase().includes(busqueda.trim().toLowerCase())) : listas;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16 }}>
      <AppButton title={t("Crear una lista nueva")} onPress={() => navigation.navigate("CrearLista", { pendingItem: { itemType, tmdbId } })} />

      <Text style={styles.label}>O elegí una existente</Text>
      <TextInput
        style={styles.buscador}
        placeholder={t("Buscar en tus listas...")}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={listasFiltradas}
        keyExtractor={(l) => l.id}
        ListEmptyComponent={<Text style={styles.vacio}>{busqueda.trim() ? "No encontramos ninguna lista con ese nombre." : "Todavía no tenés listas creadas."}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => agregarA(item.id)}>
            <Text style={styles.itemTexto}>{item.title}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: theme.colors.textMuted, marginTop: 20, marginBottom: 8 },
  buscador: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, marginBottom: 8 },
  vacio: { color: theme.colors.textMuted, fontSize: 13 },
  item: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  itemTexto: { fontSize: 15 },
});
