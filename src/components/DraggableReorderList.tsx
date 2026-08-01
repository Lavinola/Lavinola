import React, { useEffect, useRef, useState } from "react";
import { View, PanResponder, Animated } from "react-native";

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  rowHeight: number;
  renderRow: (item: T, arrastrando: boolean) => React.ReactNode;
  onSoltar: (nuevoOrden: T[]) => void;
}

/**
 * Lista con arrastrar-y-soltar para reordenar, armada solo con PanResponder
 * y Animated (ya vienen con React Native, sin agregar ninguna librería
 * nueva — evita el riesgo de romper el build nativo con dependencias de
 * gestos/animación que necesitan su propio módulo nativo).
 *
 * El elemento que se arrastra sigue al dedo con un translateY animado
 * (siempre relativo a SU posición de origen, para que nunca haya saltos
 * visuales). El resto de la lista se reacomoda al instante (sin animación
 * propia) apenas el dedo cruza el punto medio de otro renglón — funciona
 * bien y es simple; no se buscó una animación de reflow más elaborada para
 * mantenerlo liviano y confiable en todas las plataformas (incluida la
 * web, donde varias animaciones más "finas" de React Native no siempre se
 * comportan igual).
 */
export default function DraggableReorderList<T>({ items, keyExtractor, rowHeight, renderRow, onSoltar }: Props<T>) {
  const [orden, setOrden] = useState(items);
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const origenIndiceRef = useRef(0);
  const ordenRef = useRef(orden);
  ordenRef.current = orden;

  useEffect(() => {
    if (!arrastrandoId) setOrden(items);
  }, [items]);

  function crearPanResponder(item: T) {
    const id = keyExtractor(item);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origenIndiceRef.current = ordenRef.current.findIndex((o) => keyExtractor(o) === id);
        setArrastrandoId(id);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(gesture.dy);
        const origenTop = origenIndiceRef.current * rowHeight;
        const nuevaPos = Math.max(0, Math.min(ordenRef.current.length - 1, Math.round((origenTop + gesture.dy) / rowHeight)));
        const posActual = ordenRef.current.findIndex((o) => keyExtractor(o) === id);
        if (nuevaPos !== posActual) {
          const copia = [...ordenRef.current];
          const [sacado] = copia.splice(posActual, 1);
          copia.splice(nuevaPos, 0, sacado);
          setOrden(copia);
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, friction: 8 }).start();
        setArrastrandoId(null);
        onSoltar(ordenRef.current);
      },
      onPanResponderTerminate: () => {
        translateY.setValue(0);
        setArrastrandoId(null);
      },
    });
  }

  return (
    <View style={{ height: orden.length * rowHeight }}>
      {orden.map((item, indice) => {
        const id = keyExtractor(item);
        const arrastrando = arrastrandoId === id;
        const pan = crearPanResponder(item);
        return (
          <Animated.View
            key={id}
            {...pan.panHandlers}
            style={{
              position: "absolute",
              top: indice * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
              zIndex: arrastrando ? 10 : 1,
              elevation: arrastrando ? 6 : 0,
              transform: arrastrando ? [{ translateY }] : [],
            }}
          >
            {renderRow(item, arrastrando)}
          </Animated.View>
        );
      })}
    </View>
  );
}
