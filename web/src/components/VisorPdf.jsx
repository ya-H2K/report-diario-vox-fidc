import { useEffect, useRef, useState } from "react";

// Mostra um PDF na tela: as páginas desenhadas uma embaixo da outra (pdf.js, carregado só quando
// precisa). Se o pdf.js falhar, usa o leitor de PDF do próprio navegador.
// carregar() devolve o Blob do PDF. Para trocar de PDF, troque a "key" do componente.
// Desenha as páginas do PDF uma embaixo da outra (pdf.js, carregado só quando precisa).
export default function VisorPdf({ carregar, titulo = "PDF" }) {
  const carregarRef = useRef(carregar);   // o PDF muda trocando a "key" do componente
  const caixa = useRef(null);
  const [estado, setEstado] = useState({ carregando: true, erro: null, paginas: 0, quadro: null });

  useEffect(() => {
    let cancelado = false;
    let doc = null;
    let quadro = null;
    (async () => {
      let blob = null;
      try {
        blob = await carregarRef.current();
      } catch (e) {
        console.error("[pdf] não consegui baixar o PDF:", e.detalhe || e.message, e);
        if (!cancelado) setEstado({ carregando: false, erro: `Não foi possível carregar o PDF (${e.detalhe || e.message}).`, paginas: 0, quadro: null });
        return;
      }
      try {
        const [pdfjs, { default: worker }] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (cancelado) return;
        setEstado({ carregando: false, erro: null, paginas: doc.numPages, quadro: null });
        const largura = Math.min(caixa.current?.clientWidth || 900, 920);
        const escalaTela = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages && !cancelado; n++) {
          const pagina = await doc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const viewport = pagina.getViewport({ scale: (largura / base.width) * escalaTela });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "apr__pagina";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Página ${n} de ${doc.numPages}`);
          canvas.style.aspectRatio = `${base.width} / ${base.height}`;
          if (cancelado) break;
          caixa.current?.appendChild(canvas);
          await pagina.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        }
      } catch (e) {
        // se o desenho página a página falhar, mostra no leitor de PDF do próprio navegador
        console.error("[pdf] pdf.js falhou, usando o leitor do navegador:", e);
        if (cancelado) return;
        if (caixa.current) caixa.current.innerHTML = "";
        quadro = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setEstado({ carregando: false, erro: null, paginas: 0, quadro });
      }
    })();
    return () => {
      cancelado = true;
      doc?.destroy();
      if (quadro) URL.revokeObjectURL(quadro);
      if (caixa.current) caixa.current.innerHTML = "";
    };
  }, []);

  return (
    <div className="apr__visor">
      {estado.carregando && <p className="vazio" role="status">Carregando o PDF…</p>}
      {estado.erro && <p className="vazio" role="alert">{estado.erro}</p>}
      {estado.quadro && <iframe className="apr__quadro" src={estado.quadro} title={titulo} />}
      <div ref={caixa} className="apr__paginas" />
    </div>
  );
}
