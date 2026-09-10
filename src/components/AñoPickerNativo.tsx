import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from "react-native";
import { Text } from "./Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  value: number; // año inicial en el que arranca la rueda
  minimumYear?: number;
  maximumYear?: number;
  onElegido: (año: number) => void;
  onCerrar: () => void;
}

const ALTO_ITEM = 44;
const ITEMS_VISIBLES = 5; // impar, para que quede uno bien centrado en el medio
const ALTO_RUEDA = ALTO_ITEM * ITEMS_VISIBLES;
const PADDING_VERTICAL = (ALTO_RUEDA - ALTO_ITEM) / 2;

/**
 * Rueda de años tipo "selector de fecha nativo" (scrollear y que el año
 * vaya cambiando, con el del medio resaltado), hecha 100% con ScrollView
 * de React Native — así funciona igual en Android y en web, sin depender
 * de un <Picker> nativo que en Android no se ve como rueda.
 */
export default function AñoPickerNativo({ value, minimumYear, maximumYear, onElegido, onCerrar }: Props) {
  const { t } = useT();

  const min = minimumYear ?? 1900;
  const max = maximumYear ?? new Date().getFullYear();

  const años = useMemo(() => {
    const lista: number[] = [];
    for (let a = min; a <= max; a++) lista.push(a);
    return lista.length > 0 ? lista : [max];
  }, [min, max]);

  const valorInicial = años.includes(value) ? value : max;
  const indiceInicial = Math.max(0, años.indexOf(valorInicial));

  const [indiceActual, setIndiceActual] = useState(indiceInicial);
  const scrollRef = useRef<ScrollView>(null);
  const yaPosicionado = useRef(false);

  const asentarEnIndice = useCallback(
    (idx: number, animado: boolean = true) => {
      const idxClamp = Math.max(0, Math.min(años.length - 1, idx));
      scrollRef.current?.scrollTo({ y: idxClamp * ALTO_ITEM, animated: animado });
      setIndiceActual(idxClamp);
    },
    [años.length]
  );

  // Mientras se scrollea, vamos resaltando en vivo cuál quedaría seleccionado.
  const manejarScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / ALTO_ITEM);
      const idxClamp = Math.max(0, Math.min(años.length - 1, idx));
      setIndiceActual((prev) => (prev !== idxClamp ? idxClamp : prev));
    },
    [años.length]
  );

  // Cuando el scroll termina de asentarse (o el usuario lo suelta en web,
  // donde a veces no dispara el evento de "momentum"), lo enganchamos
  // exactamente en el año más cercano.
  const manejarFinDeScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      asentarEnIndice(Math.round(y / ALTO_ITEM));
    },
    [asentarEnIndice]
  );

  function confirmar() {
    onElegido(años[indiceActual]);
    onCerrar();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <Text style={styles.titulo}>{t("Elegir año")}</Text>

          <View style={styles.ruedaContenedor}>
            <View pointerEvents="none" style={styles.franjaSeleccion} />
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ALTO_ITEM}
              decelerationRate="fast"
              contentContainerStyle={{ paddingVertical: PADDING_VERTICAL }}
              onScroll={manejarScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={manejarFinDeScroll}
              onScrollEndDrag={Platform.OS === "web" ? manejarFinDeScroll : undefined}
              onContentSizeChange={() => {
                if (!yaPosicionado.current) {
                  yaPosicionado.current = true;
                  asentarEnIndice(indiceInicial, false);
                }
              }}
            >
              {años.map((año, idx) => {
                const distancia = Math.abs(idx - indiceActual);
                const opacidad = distancia === 0 ? 1 : distancia === 1 ? 0.55 : 0.28;
                return (
                  <Pressable key={año} onPress={() => asentarEnIndice(idx)} style={styles.itemFila}>
                    <Text
                      style={[
                        styles.itemTexto,
                        { opacity: opacidad },
                        idx === indiceActual && styles.itemTextoActivo,
                      ]}
                    >
                      {año}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.botonesRow}>
            <Pressable style={styles.btnCancelar} onPress={onCerrar}>
              <Text style={styles.btnCancelarTexto}>{t("Cancelar")}</Text>
            </Pressable>
            <Pressable style={styles.btnConfirmar} onPress={confirmar}>
              <Text style={styles.btnConfirmarTexto}>{t("Confirmar")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, width: "100%", maxWidth: 320 },
  titulo: { fontSize: 16, fontWeight: "700", marginBottom: 16, textAlign: "center" },

  ruedaContenedor: {
    height: ALTO_RUEDA,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: "hidden",
    position: "relative",
  },
  franjaSeleccion: {
    position: "absolute",
    top: PADDING_VERTICAL,
    left: 0,
    right: 0,
    height: ALTO_ITEM,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(166,63,224,0.10)",
  },
  itemFila: {
    height: ALTO_ITEM,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTexto: {
    fontSize: 17,
    color: theme.colors.text,
    fontWeight: "500",
  },
  itemTextoActivo: {
    fontSize: 21,
    fontWeight: "800",
    color: theme.colors.primaryLight,
  },

  botonesRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btnCancelar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  btnCancelarTexto: { color: theme.colors.textMuted, fontWeight: "700", fontSize: 14 },
  btnConfirmar: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.primary },
  btnConfirmarTexto: { color: "#000000", fontWeight: "700", fontSize: 14 },
});
