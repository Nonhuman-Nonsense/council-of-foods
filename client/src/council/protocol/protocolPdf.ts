import { jsPDF } from "jspdf";

/**
 * Lays out a rendered {@link ProtocolDocument} as an A4 PDF. Resolves once
 * layout has finished; the caller saves it (web download) or takes its bytes
 * (`output("blob")`, for printing).
 */
export async function createProtocolPdf(element: HTMLElement): Promise<jsPDF> {
  await import("../../Tinos.js");
  const pdf = new jsPDF("p", "pt", "a4");
  pdf.setFont("Tinos");
  await new Promise<void>((resolve) => {
    pdf.html(element, {
      callback: () => resolve(),
      autoPaging: 'text',
      margin: [50, 50, 50, 50]
    });
  });
  return pdf;
}
