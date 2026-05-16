import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatmapLayerProps {
  points: [number, number, number][]; // [lat, lng, intensity]
}

export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    // Create the heat layer
    // @ts-ignore
    const heatLayer = L.heatLayer(points, {
      radius: 40,
      blur: 30,
      maxZoom: 15,
      max: 1.0,
      gradient: {
        0.4: "blue",
        0.6: "yellow",
        0.8: "orange",
        1.0: "red"
      }
    });

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);

  return null;
}
