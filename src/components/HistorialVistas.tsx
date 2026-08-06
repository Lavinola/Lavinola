import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import ActionSheetModal from "./ActionSheetModal";
import ConfirmModal from "./ConfirmModal";
import FechaPickerNativo from "./FechaPickerNativo";
import { formatearFecha } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import { EventoVisto } from "../lib/watchStatus";

interface Props {
  eventos: EventoVisto[]; // ordenados de la vista más vieja a la más nueva
  onEditarFecha: (eventoId: string, fechaISO: string) => void;
  onEliminar: (eventoId: string) => void;
  genero?: "f" | "m"; // "f" = "Vista"/"La viste" (película, serie) — "m" = "Visto"/"Lo viste" (capítulo)
  fechaEstreno?: string | null; // para poder ofrecer "Fue el día de estreno" en la primera vista, como en los 3 puntitos
}

/**
 * Lista completa de todas las veces que se vio un título (película o
 * capítulo) — la primera como "Vista/Visto el", el resto como "Vuelta a
 * ver el". El lápiz de la PRIMERA abre el mismo menú "¿Cuándo la
 * viste?" de siempre (día de estreno / elegir otra fecha) — no tiene
 * sentido "eliminar" la primera vista sin más (eso es "no vista, me
 * equivoqué", que es otra acción). El lápiz de las demás (las "Vuelta a
 * ver") sí ofrece Editar fecha / Eliminar esa vista puntual.
 */
export default function HistorialVistas({ eventos, onEditarFecha, onEliminar, genero = "f", fechaEstreno }: Props) {
  const { t } = useT();
  const [menuPrimeraVisible, setMenuPrimeraVisible] = useState(false);
  const [menuEventoId, setMenuEventoId] = useState<string | null>(null);
  const [pickerEventoId, setPickerEventoId] = useState<string | null>(null);
  const [confirmEliminarId, setConfirmEliminarId] = useState<string | null>(null);

  if (eventos.length === 0) return null;
  const [primero, ...resto] = eventos;
  const eventoDelPicker = eventos.find((e) => e.id === pickerEventoId);
  const textoVista = genero === "m" ? t("Visto el") : t("Vista el");
  const textoLaViste = genero === "m" ? t("Lo viste") : t("La viste");

  return (
    <View style={styles.wrap}>
      <View style={styles.fila}>
        <Text style={styles.texto}>
          {textoVista} {formatearFecha(primero.watchedAt)}
        </Text>
        <Pressable onPress={() => setMenuPrimeraVisible(true)} hitSlop={8}>
          <Text style={styles.lapiz}>✎</Text>
        </Pressable>
      </View>
      {resto.map((e) => (
        <View key={e.id} style={styles.fila}>
          <Text style={styles.texto}>
            {t("Vuelta a ver el")} {formatearFecha(e.watchedAt)}
          </Text>
          <Pressable onPress={() => setMenuEventoId(e.id)} hitSlop={8}>
            <Text style={styles.lapiz}>✎</Text>
          </Pressable>
        </View>
      ))}
      {eventos.length > 1 && (
        <Text style={styles.veces}>
          {textoLaViste} {eventos.length} {t("veces")}
        </Text>
      )}

      <ActionSheetModal
        visible={menuPrimeraVisible}
        onCerrar={() => setMenuPrimeraVisible(false)}
        titulo={genero === "m" ? t("¿Cuándo lo viste?") : t("¿Cuándo la viste?")}
        opciones={[
          ...(fechaEstreno
            ? [
                {
                  label: t("Fue el día de estreno ({fecha})").replace("{fecha}", formatearFecha(fechaEstreno)),
                  icono: "calendar-outline" as const,
                  onPress: () => onEditarFecha(primero.id, new Date(fechaEstreno).toISOString()),
                },
              ]
            : []),
          { label: t("Elegir otra fecha"), icono: "create-outline", onPress: () => setPickerEventoId(primero.id) },
        ]}
      />

      <ActionSheetModal
        visible={!!menuEventoId}
        onCerrar={() => setMenuEventoId(null)}
        opciones={[
          {
            label: t("Editar fecha"),
            icono: "create-outline",
            onPress: () => {
              const id = menuEventoId;
              setMenuEventoId(null);
              setPickerEventoId(id);
            },
          },
          {
            label: t("Eliminar"),
            icono: "trash-outline",
            destructivo: true,
            onPress: () => {
              const id = menuEventoId;
              setMenuEventoId(null);
              setConfirmEliminarId(id);
            },
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirmEliminarId}
        onCerrar={() => setConfirmEliminarId(null)}
        titulo={t("Eliminar vista")}
        mensaje={t("¿Seguro que querés eliminar esta vista? No se puede deshacer.")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          {
            label: t("Eliminar"),
            destacado: true,
            onPress: () => {
              if (confirmEliminarId) onEliminar(confirmEliminarId);
              setConfirmEliminarId(null);
            },
          },
        ]}
      />

      {eventoDelPicker && (
        <FechaPickerNativo
          value={new Date(eventoDelPicker.watchedAt)}
          maximumDate={new Date()}
          onCerrar={() => setPickerEventoId(null)}
          onElegida={(fecha) => onEditarFecha(eventoDelPicker.id, fecha.toISOString())}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, alignItems: "center" },
  fila: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  texto: { fontSize: 12, color: theme.colors.textFaint },
  lapiz: { fontSize: 12, color: theme.colors.textFaint },
  veces: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 6 },
});
