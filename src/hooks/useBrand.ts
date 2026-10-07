import { useEffect, useState } from "react";
import { BRAND_KEY, readBrand } from "@/lib/branding";

export function useBrand() {
  const [brand, setBrand] = useState(readBrand);
  useEffect(() => {
    const changed = () => setBrand(readBrand());
    const storage = (event: StorageEvent) => { if (!event.key || event.key === BRAND_KEY) changed(); };
    window.addEventListener("mne-brand-changed", changed);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("mne-brand-changed", changed);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return brand;
}
