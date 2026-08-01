import React, { useEffect, useRef, useState } from "react";
import { View, ScrollView, PanResponder, Animated, GestureResponderHandlers } from "react-native";

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  rowHeight: number;
  renderRow: (item: T, arrastrando: boolean, handlePanHandlers: GestureResponderHandlers) => React.ReactNode;
  onSoltar: (nuevoOrden: T[]) => void;
}

interface FilaProps<T> {
  item: T;
  indice: number;
  origenIndice: number;
  rowHeight: number;
  id: string;
  arrastrando: boolean;
  translateY: Animated.Value;
  renderRow: Props<T>["renderRow"];
  onGrant: (id: string) => void;
  onMove: (id: string, dy: number) => void;
  onRelease: () => void;
}

/**
 * Una fila individual. Lo importante acá: el PanResponder se crea UNA sola
 * vez (con useRef) y nunca se vuelve a crear en repintados posteriores —
 * si se recrea en cada repintado (como pasaba antes, al armarlo directo
 * dentro del .map() de la lista), el simple hecho de arrastrar dispara un
 * repintado, que recreaba el gesto, que lo cortaba a la mitad — por eso
 * "parpadeaba y volvía a su lugar" en vez de arrastrarse bien. Para que
 * igual use datos siempre al día (qué fila es, en qué posición está, etc.)
 * sin necesidad de recrear el gesto, esos datos se guardan en un ref que
 * se actualiza en cada repintado, y el PanResponder (fijo) siempre lee la
 * versión más nueva de ahí adentro.
 *
 * Otro detalle importante: mientras se arrastra un título, su posición en
 * pantalla ("top") se calcula desde su índice ORIGINAL (el que tenía al
 * empezar el gesto), no el actual — el actual va cambiando a medida que
 * empuja a los demás, y el movimiento del dedo (translateY) ya es relativo
 * a la posición de arranque. Si se usara el índice actual, cada vez que se
 * reordena un vecino la base salta de golpe y el movimiento del dedo se
 * sigue sumando arriba de esa base nueva — el título se iba alejando del
 * dedo cada vez más. Fijando la base de origen, el título siempre queda
 * exactamente donde está el dedo.
 */
function Fila<T>({ item, indice, origenIndice, rowHeight, id, arrastrando, translateY, renderRow, onGrant, onMove, onRelease }: FilaProps<T>) {
  const callbacksRef = useRef({ onGrant, onMove, onRelease, id });
  callbacksRef.current = { onGrant, onMove, onRelease, id };

  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => callbacksRef.current.onGrant(callbacksRef.current.id),
      onPanResponderMove: (_, gesture) => callbacksRef.current.onMove(callbacksRef.current.id, gesture.dy),
      onPanResponderRelease: () => callbacksRef.current.onRelease(),
      onPanResponderTerminate: () => callbacksRef.current.onRelease(),
    })
  );

  const topFijo = (arrastrando ? origenIndice : indice) * rowHeight;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: topFijo,
        left: 0,
        right: 0,
        height: rowHeight,
        zIndex: arrastrando ? 10 : 1,
        elevation: arrastrando ? 6 : 0,
        transform: arrastrando ? [{ translateY }] : [],
      }}
    >
      {renderRow(item, arrastrando, panRef.current.panHandlers)}
    </Animated.View>
  );
}

/**
 * Lista con arrastrar-y-soltar para reordenar, armada solo con PanResponder
 * y Animated (ya vienen con React Native, sin agregar ninguna librería
 * nueva — evita el riesgo de romper el build nativo con dependencias de
 * gestos/animación que necesitan su propio módulo nativo).
 *
 * El gesto de arrastre SOLO se activa tocando el "handle" (el renderRow le
 * pasa handlePanHandlers a lo que sea que uno quiera usar como agarradera,
 * normalmente un ícono a la derecha) — el resto de la fila queda libre
 * para poder scrollear normal.
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

  function onGrant(id: string) {
    origenIndiceRef.current = ordenRef.current.findIndex((o) => keyExtractor(o) === id);
    setArrastrandoId(id);
    translateY.setValue(0);
  }

  function onMove(id: string, dy: number) {
    translateY.setValue(dy);
    const origenTop = origenIndiceRef.current * rowHeight;
    const nuevaPos = Math.max(0, Math.min(ordenRef.current.length - 1, Math.round((origenTop + dy) / rowHeight)));
    const posActual = ordenRef.current.findIndex((o) => keyExtractor(o) === id);
    if (nuevaPos !== posActual) {
      const copia = [...ordenRef.current];
      const [sacado] = copia.splice(posActual, 1);
      copia.splice(nuevaPos, 0, sacado);
      setOrden(copia);
    }
  }

  function onRelease() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: false, friction: 8 }).start();
    setArrastrandoId(null);
    onSoltar(ordenRef.current);
  }

  return (
    <ScrollView style={{ flex: 1 }} scrollEnabled={!arrastrandoId}>
      <View style={{ height: orden.length * rowHeight }}>
        {orden.map((item, indice) => {
          const id = keyExtractor(item);
          return (
            <Fila
              key={id}
              item={item}
              indice={indice}
              origenIndice={origenIndiceRef.current}
              rowHeight={rowHeight}
              id={id}
              arrastrando={arrastrandoId === id}
              translateY={translateY}
              renderRow={renderRow}
              onGrant={onGrant}
              onMove={onMove}
              onRelease={onRelease}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}
