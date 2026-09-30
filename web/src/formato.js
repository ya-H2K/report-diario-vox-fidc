const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");

export const brl = (v) => (v === null || v === undefined ? "—" : moeda.format(v));
export const num = (v) => (v === null || v === undefined || v === "" ? "—" : inteiro.format(v));

const utc = (iso) => new Date(`${iso}T12:00:00Z`);
const fmt = (opts) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts });

export const diaSemana = (iso) => {
  const s = fmt({ weekday: "long" }).format(utc(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const diaMes = (iso) => fmt({ day: "numeric", month: "long" }).format(utc(iso));
export const ano = (iso) => iso.slice(0, 4);
export const curta = (iso) => fmt({ day: "2-digit", month: "2-digit" }).format(utc(iso));

// Tabela do fluxo de caixa: número com 2 casas, sem "R$" em cada célula.
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const valorNum = (v) => (v === null || v === undefined ? "—" : decimal.format(v));
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v) => (v === null || v === undefined ? "—" : porcento.format(v));
