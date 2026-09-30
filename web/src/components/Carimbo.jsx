// Selo de status (padrão Anúbis). A cor e o traço vêm do status.
export default function Carimbo({ status, children }) {
  return (
    <span className={`carimbo carimbo--${status}`}>
      {status === "aguardando" && <span className="carimbo__pulso" aria-hidden="true" />}
      {children}
    </span>
  );
}
