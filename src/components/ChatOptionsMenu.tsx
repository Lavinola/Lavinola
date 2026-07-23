import React, { useState } from "react";
import { Alert } from "../lib/alert";
import ActionSheetModal from "./ActionSheetModal";
import ConfirmModal from "./ConfirmModal";
import ReportModal from "./ReportModal";
import { useT } from "../i18n/i18n";
import {
  silenciarChat,
  quitarSilencioChat,
  vaciarChat,
  eliminarChat,
  bloquearChat,
  desbloquearChat,
} from "../lib/chats";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  userId: string | null;
  chatId: string;
  otroUserId: string;
  silenciado: boolean;
  bloqueado: boolean;
  onCambio: () => void; // refrescar la lista/pantalla después de cualquier acción
  onChatEliminado?: () => void; // por si hay que salir de la pantalla (ej. estando adentro del chat)
}

export default function ChatOptionsMenu({ visible, onCerrar, userId, chatId, otroUserId, silenciado, bloqueado, onCambio, onChatEliminado }: Props) {
  const { t } = useT();
  const [menuSilenciarVisible, setMenuSilenciarVisible] = useState(false);
  const [confirmVaciarVisible, setConfirmVaciarVisible] = useState(false);
  const [confirmEliminarVisible, setConfirmEliminarVisible] = useState(false);
  const [confirmBloquearVisible, setConfirmBloquearVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  async function toggleSilencio() {
    if (!userId) return;
    onCerrar();
    if (silenciado) {
      try {
        await quitarSilencioChat(userId, chatId);
        onCambio();
      } catch (e: any) {
        Alert.alert(t("No se pudo actualizar"), e.message);
      }
    } else {
      setMenuSilenciarVisible(true);
    }
  }

  async function silenciar(duracion: "1dia" | "1semana" | "siempre") {
    if (!userId) return;
    setMenuSilenciarVisible(false);
    try {
      await silenciarChat(userId, chatId, duracion);
      onCambio();
    } catch (e: any) {
      Alert.alert(t("No se pudo silenciar"), e.message);
    }
  }

  async function confirmarVaciar() {
    if (!userId) return;
    setConfirmVaciarVisible(false);
    try {
      await vaciarChat(userId, chatId);
      onCambio();
    } catch (e: any) {
      Alert.alert(t("No se pudo vaciar"), e.message);
    }
  }

  async function confirmarEliminar() {
    if (!userId) return;
    setConfirmEliminarVisible(false);
    try {
      await eliminarChat(userId, chatId);
      onCambio();
      onChatEliminado?.();
    } catch (e: any) {
      Alert.alert(t("No se pudo eliminar"), e.message);
    }
  }

  async function confirmarBloqueo() {
    if (!userId) return;
    setConfirmBloquearVisible(false);
    try {
      if (bloqueado) {
        await desbloquearChat(userId, chatId);
      } else {
        await bloquearChat(userId, chatId);
        onChatEliminado?.();
      }
      onCambio();
    } catch (e: any) {
      Alert.alert(t("No se pudo actualizar"), e.message);
    }
  }

  return (
    <>
      <ActionSheetModal
        visible={visible}
        onCerrar={onCerrar}
        opciones={[
          { label: silenciado ? t("Dejar de silenciar") : t("Silenciar chat"), icono: "volume-mute-outline", onPress: toggleSilencio },
          { label: t("Vaciar chat"), icono: "trash-bin-outline", onPress: () => { onCerrar(); setConfirmVaciarVisible(true); } },
          { label: t("Eliminar chat"), icono: "close-circle-outline", destructivo: true, onPress: () => { onCerrar(); setConfirmEliminarVisible(true); } },
          { label: t("Reportar"), icono: "flag-outline", destructivo: true, onPress: () => { onCerrar(); setReportVisible(true); } },
          {
            label: bloqueado ? t("Desbloquear") : t("Bloquear"),
            icono: "ban-outline",
            destructivo: !bloqueado,
            onPress: () => { onCerrar(); setConfirmBloquearVisible(true); },
          },
        ]}
      />

      <ActionSheetModal
        visible={menuSilenciarVisible}
        onCerrar={() => setMenuSilenciarVisible(false)}
        titulo={t("¿Por cuánto tiempo?")}
        opciones={[
          { label: t("1 día"), icono: "time-outline", onPress: () => silenciar("1dia") },
          { label: t("1 semana"), icono: "time-outline", onPress: () => silenciar("1semana") },
          { label: t("Siempre"), icono: "infinite-outline", onPress: () => silenciar("siempre"), destructivo: true },
        ]}
      />

      <ConfirmModal
        visible={confirmVaciarVisible}
        onCerrar={() => setConfirmVaciarVisible(false)}
        titulo={t("Vaciar chat")}
        mensaje={t("Se borra todo el contenido de este chat, solo para vos. La otra persona sigue viéndolo. ¿Seguro?")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Vaciar"), destacado: true, onPress: confirmarVaciar },
        ]}
      />

      <ConfirmModal
        visible={confirmEliminarVisible}
        onCerrar={() => setConfirmEliminarVisible(false)}
        titulo={t("Eliminar chat")}
        mensaje={t("Se vacía y desaparece de tu lista de chats, solo para vos. ¿Seguro?")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Eliminar"), destacado: true, onPress: confirmarEliminar },
        ]}
      />

      <ConfirmModal
        visible={confirmBloquearVisible}
        onCerrar={() => setConfirmBloquearVisible(false)}
        titulo={bloqueado ? t("Desbloquear") : t("Bloquear")}
        mensaje={
          bloqueado
            ? t("Van a poder volver a escribirse. ¿Seguro?")
            : t("Ninguno de los dos va a poder mandar mensajes mientras esté bloqueado, y desaparece de tu lista de chats (el contenido no se borra). ¿Seguro?")
        }
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: bloqueado ? t("Desbloquear") : t("Bloquear"), destacado: true, onPress: confirmarBloqueo },
        ]}
      />

      <ReportModal visible={reportVisible} onCerrar={() => setReportVisible(false)} reporterId={userId} targetType="user" targetId={otroUserId} />
    </>
  );
}
