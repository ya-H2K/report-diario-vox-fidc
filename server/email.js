// Envio dos códigos de confirmação. Em "teste", o código aparece na janela do servidor
// (e num arquivo em server/dados). Em "smtp", o e-mail é enviado de verdade.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados");

const ASSUNTOS = {
  cadastro: "Seu código de confirmação - Report Vox FIDC",
  senha: "Código para redefinir sua senha - Report Vox FIDC",
};

export async function enviarCodigo({ para, nome, codigo, finalidade }) {
  const assunto = ASSUNTOS[finalidade] || ASSUNTOS.cadastro;
  const primeiroNome = String(nome || "").split(" ")[0];
  const texto = `Olá${primeiroNome ? `, ${primeiroNome}` : ""}.\n\nSeu código é: ${codigo}\n\n` +
    `Ele vale por 15 minutos. Se você não pediu este código, ignore este e-mail.\n\nReport Vox FIDC`;

  if (config.emailModo !== "smtp") {
    console.log(`\n  [E-MAIL DE TESTE] para ${para}\n  ${assunto}\n  Código: ${codigo}\n`);
    fs.mkdirSync(PASTA, { recursive: true });
    fs.appendFileSync(path.join(PASTA, "emails_teste.log"),
      `${new Date().toISOString()} | ${para} | ${finalidade} | ${codigo}\n`, "utf-8");
    return;
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporte = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPorta, secure: config.smtpPorta === 465,
    auth: config.smtpUsuario ? { user: config.smtpUsuario, pass: config.smtpSenha } : undefined,
  });
  await transporte.sendMail({
    from: config.smtpRemetente || config.smtpUsuario, to: para, subject: assunto, text: texto,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f1b14">
      <p>Olá${primeiroNome ? `, ${primeiroNome}` : ""}.</p><p>Seu código é:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:600;color:#7d5f1f">${codigo}</p>
      <p style="color:#6f6656">Ele vale por 15 minutos. Se você não pediu este código, ignore este e-mail.</p>
      <p style="color:#a8812f">Report Vox FIDC</p></div>`,
  });
}
