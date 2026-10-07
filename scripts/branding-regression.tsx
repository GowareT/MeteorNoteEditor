import { createRoot } from "react-dom/client";
import { useState } from "react";
import { BrandSettings } from "../src/components/BrandSettings";
import { useBrand } from "../src/hooks/useBrand";
import { readBrand, saveBrand, logoFromFile } from "../src/lib/branding";
import "../src/styles/tokens.css";
import "../src/views/SettingsView.css";

function Fixture() {
  const brand = useBrand();
  const [result, setResult] = useState("Ready");
  async function testLogo() {
    const previous = readBrand();
    try {
      const source = await (await fetch("/logo.png")).blob();
      const logo = await logoFromFile(new File([source], "logo.png", { type: "image/png" }));
      const image = new Image(); image.src = logo; await image.decode();
      if (!image.naturalWidth || Math.max(image.naturalWidth, image.naturalHeight) > 256) throw new Error("Wrong logo dimensions");
      saveBrand({ logo });
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (document.querySelector<HTMLImageElement>('img[alt="当前 Logo"]')?.src !== logo) throw new Error("Logo did not update");
      let rejected = false;
      try { await logoFromFile(new File(["not an image"], "broken.png", { type: "image/png" })); }
      catch { rejected = true; }
      if (!rejected) throw new Error("Corrupt image accepted");
      setResult("Passed: actual PNG decode, resize, saved logo preview, corrupted-image rejection and reset.");
    } catch (e) { setResult(String(e)); }
    finally { saveBrand(previous); }
  }
  return <main className="mne-settings__body">
    <h1>Branding regression</h1><p>{brand.name}</p>
    <button onClick={() => void testLogo()}>Run logo tests</button><pre role="status">{result}</pre>
    <BrandSettings />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
