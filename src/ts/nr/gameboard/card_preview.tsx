// Card hover/zoom preview panel.
// Mirrors: src/cljs/nr/gameboard/card_preview.cljs
import React, { useState, useEffect } from "react";
import { setZoomChannelCallback, zoomChannelPut } from "./card_preview";

export function CardPreview(_props: { card: object | null }): React.ReactElement {
  const [card, setCard] = useState<object | null>(_props.card);

  useEffect(() => {
    setZoomChannelCallback((value: unknown) => {
      if (value === false || value === null) {
        setCard(null);
      } else {
        setCard(value as object);
      }
    });
    return () => {
      setZoomChannelCallback(null);
    };
  }, []);

  if (!card) return <div className="card-preview blue-shade" />;

  return <div className="card-preview blue-shade" />;
}

export default CardPreview;
