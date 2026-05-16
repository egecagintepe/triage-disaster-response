import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.offline";

interface Props {
  url: string;
  attribution: string;
  className?: string;
}

export default function OfflineTileLayer({ url, attribution, className }: Props) {
  const map = useMap();

  useEffect(() => {
    // Create the offline tile layer
    const tileLayerOffline = L.tileLayer.offline(url, {
      attribution,
      subdomains: "abc",
      minZoom: 2,
      maxZoom: 19,
      crossOrigin: true,
      className,
    });

    tileLayerOffline.addTo(map);

    // Create the save control
    const controlSaveTiles = L.control.savetiles(tileLayerOffline, {
      zoomlevels: [13, 14, 15, 16, 17],
      confirm(layer: any, successCallback: any) {
        if (window.confirm(`Haritayı çevrimdışı kullanım için kaydet (${layer._tilesforSave.length} parça)?`)) {
          successCallback();
        }
      },
      confirmRemoval(layer: any, successCallback: any) {
        if (window.confirm("Kayıtlı harita verilerini sil?")) {
          successCallback();
        }
      },
      saveText: '<div title="Haritayı İndir" style="font-size:18px; padding: 2px;">💾</div>',
      rmText: '<div title="Kayıtlı Haritayı Sil" style="font-size:18px; padding: 2px;">🗑️</div>',
    });

    controlSaveTiles.addTo(map);

    return () => {
      map.removeControl(controlSaveTiles);
      map.removeLayer(tileLayerOffline);
    };
  }, [map, url, attribution]);

  return null;
}
