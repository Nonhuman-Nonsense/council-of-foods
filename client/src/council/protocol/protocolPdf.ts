import { jsPDF } from "jspdf";
import { LETTER_WIDTH_PX } from "./LetterDocument";

const PT_PER_MM = 72 / 25.4;

/**
 * Where a visitor puts the magnets that hang a printed letter or reply on the wall: an empty
 * circle, 3 mm across, centred on the page with its centre 20 mm from the top edge.
 */
const MAGNET_MARK = { centreFromTopMm: 20, diameterMm: 3, lineWidthPt: 1 /* 2px */ };

/**
 * A letter's page ({@link LetterDocument}): 25 mm sides, and room at the foot of every page for
 * the QR code to the meeting, centred, with the meeting's number beneath it.
 */
const LETTER_PAGE = {
  marginsMm: { top: 35, side: 25, bottom: 47 },
  qr: { topMm: 253.5, sizeMm: 15 },
  label: { baselineMm: 274, sizePt: 9, gray: 128 },
};

interface ProtocolPdfOptions {
  /** Draw the magnet mark on the first page — on what is printed and hung, not on downloads. */
  magnetMark?: boolean;
}

/**
 * Lays out a rendered {@link ProtocolDocument} or {@link LetterDocument} as an A4 PDF. Resolves
 * once layout has finished; the caller saves it (web download) or takes its bytes
 * (`output("blob")`, for printing).
 */
export async function createProtocolPdf(
  element: HTMLElement,
  { magnetMark = false }: ProtocolPdfOptions = {},
): Promise<jsPDF> {
  const letter = element.dataset.layout === "letter";
  if (letter) await import("../../Arimo.js");
  else await import("../../Tinos.js");
  const pdf = new jsPDF("p", "pt", "a4");
  pdf.setFont(letter ? "Arimo" : "Tinos");
  await new Promise<void>((resolve) => {
    pdf.html(element, {
      callback: () => resolve(),
      autoPaging: 'text',
      ...(letter ? letterGeometry(pdf) : { margin: [100, 50, 50, 50] }),
    });
  });
  const footer = element.querySelector<HTMLElement>("[data-page-footer]");
  const qr = footer?.querySelector("canvas");
  if (footer && qr) drawPageFooter(pdf, qr, footer.dataset.pageFooter ?? "");
  if (magnetMark) drawMagnetMark(pdf);
  return pdf;
}

function letterGeometry(pdf: jsPDF) {
  const { top, side, bottom } = LETTER_PAGE.marginsMm;
  return {
    margin: [top * PT_PER_MM, side * PT_PER_MM, bottom * PT_PER_MM, side * PT_PER_MM],
    width: pdf.internal.pageSize.getWidth() - 2 * side * PT_PER_MM,
    windowWidth: LETTER_WIDTH_PX,
  };
}

function drawPageFooter(pdf: jsPDF, qr: HTMLCanvasElement, label: string): void {
  const centre = pdf.internal.pageSize.getWidth() / 2;
  const size = LETTER_PAGE.qr.sizeMm * PT_PER_MM;
  const image = qr.toDataURL("image/png");
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.addImage(image, "PNG", centre - size / 2, LETTER_PAGE.qr.topMm * PT_PER_MM, size, size);
    pdf.setFont("Arimo", "normal");
    pdf.setFontSize(LETTER_PAGE.label.sizePt);
    pdf.setTextColor(LETTER_PAGE.label.gray);
    pdf.text(label, centre, LETTER_PAGE.label.baselineMm * PT_PER_MM, { align: "center" });
  }
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
