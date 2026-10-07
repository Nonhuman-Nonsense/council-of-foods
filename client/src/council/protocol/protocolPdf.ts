import { jsPDF } from "jspdf";

const PT_PER_MM = 72 / 25.4;

/**
 * Where a visitor puts the magnets that hang a printed letter or reply on the wall: an empty
 * circle, 5 mm across, centred on the page with its centre 20 mm from the top edge.
 */
const MAGNET_MARK = { centreFromTopMm: 20, diameterMm: 5, lineWidthPt: 1.5 /* 2px */ };

interface ProtocolPdfOptions {
  /** Draw the magnet mark on the first page — on what is printed and hung, not on downloads. */
  magnetMark?: boolean;
}

/**
 * Lays out a rendered {@link ProtocolDocument} as an A4 PDF. Resolves once
 * layout has finished; the caller saves it (web download) or takes its bytes
 * (`output("blob")`, for printing).
 */
export async function createProtocolPdf(
  element: HTMLElement,
  { magnetMark = false }: ProtocolPdfOptions = {},
): Promise<jsPDF> {
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
  if (magnetMark) drawMagnetMark(pdf);
  return pdf;
}

function drawMagnetMark(pdf: jsPDF): void {
  pdf.setPage(1);
  pdf.setDrawColor(0);
  pdf.setLineWidth(MAGNET_MARK.lineWidthPt);
  pdf.circle(
    pdf.internal.pageSize.getWidth() / 2,
    MAGNET_MARK.centreFromTopMm * PT_PER_MM,
    (MAGNET_MARK.diameterMm / 2) * PT_PER_MM,
    "S",
  );
}
