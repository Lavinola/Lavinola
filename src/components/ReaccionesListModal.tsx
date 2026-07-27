import React from "react";
import { Modal, View, Pressable, FlatList, Image, StyleSheet } from "react-native";
import { Text } from "./Themed";
import IconoReaccion from "./IconoReaccion";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";

export interface ReaccionConAutor {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  emoji: string;
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  reacciones: ReaccionConAutor[];
  onVerPerfil: (userId: string) => void;
}

export default function ReaccionesListModal({ visible, onCerrar, reacciones, onVerPerfil }: Props) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("Reaccionaron")}</Text>
          <FlatList
            data={reacciones}
            keyExtractor={(r) => r.user_id}
            style={{ maxHeight: 360 }}
            ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía nadie reaccionó.")}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() => {
                  onCerrar();
                  onVerPerfil(item.user_id);
                }}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <Text style={styles.username}>{item.username ?? t("Usuario")}</Text>
                <IconoReaccion reaccionKey={item.emoji} size={22} />
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20 },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 12, color: theme.colors.text },
  vacio: { textAlign: "center", color: theme.colors.textMuted, paddingVertical: 20 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.text },
  emoji: { fontSize: 20 },
});
