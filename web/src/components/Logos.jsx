import logoH2 from "../assets/h2-kapital.svg";

// Logo da H2 Kapital: arte original (dourado e branco), vetorizada para ficar nítida em qualquer tela.
export function LogoH2({ className = "" }) {
  return <img className={`logo-h2 ${className}`} src={logoH2} alt="H2 Kapital" width="135" height="146" />;
}

// Logo da Vox: o mesmo desenho vazado (só o contorno das letras) do original, mas na cor
// do texto do portal (creme no escuro, grafite no claro), em vez do azul.
const VOX = "M2.10 2.00 L10.60 2.00 L22.50 28.40 L35.20 2.00 L43.60 2.00 L25.40 38.10 L19.60 38.10 Z M44.20 19.90 a21.6 18.0 0 1 0 43.2 0 a21.6 18.0 0 1 0 -43.2 0 Z M52.00 19.90 a13.9 10.9 0 1 0 27.8 0 a13.9 10.9 0 1 0 -27.8 0 Z M88.50 2.00 L97.50 2.00 L107.00 14.20 L116.50 2.00 L125.50 2.00 L111.50 19.95 L125.70 38.10 L116.70 38.10 L107.00 25.80 L97.30 38.10 L88.30 38.10 L102.50 19.95 Z";

export function LogoVox({ className = "" }) {
  return (
    <svg className={`logo-vox ${className}`} viewBox="1.2 1.2 125.2 37.6" role="img" aria-label="Vox">
      <path d={VOX} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
