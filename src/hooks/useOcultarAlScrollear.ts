import { useRef, useState } from "react";
import { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

/**
 * Para usar en cualquier FlatList/ScrollView: devuelve si el FAB tiene que
 * estar visible, y el onScroll para engancharle. Compara contra el offset
 * anterior para saber la dirección — con un margen chico para que no
 * tiemble con scrolls mínimos (rebotes, etc).
 */
export function useOcultarAlScrollear() {
  const [visible, setVisible] = useState(true);
  const offsetAnteriorRef = useRef(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const actual = e.nativeEvent.contentOffset.y;
    const diferencia = actual - offsetAnteriorRef.current;

    if (actual <= 8) {
      setVisible(true); // arriba de todo, siempre visible
    } else if (diferencia > 6) {
      setVisible(false); // scrolleando para abajo
    } else if (diferencia < -6) {
      setVisible(true); // scrolleando para arriba
    }
    offsetAnteriorRef.current = actual;
  }

  return { visible, onScroll };
}
