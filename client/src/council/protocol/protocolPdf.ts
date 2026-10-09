import { jsPDF } from "jspdf";
import { LETTER_WIDTH_PX } from "./LetterDocument";

const PT_PER_MM = 72 / 25.4;

/**
 * Where a visitor puts the magnets that hang a printed letter or reply on the wall: an empty
 * circle, 3 mm across, centred on the page with its centre 20 mm from the top edge.
 */
const MAGNET_MARK = { centreFromTopMm: 20, diameterMm: 3, lineWidthPt: 1 /* 2px */ };

/**
 * A letter's page ({@link LetterDocument}), as LETTER design V2 measures it: 25 mm sides; the QR
 * code to the meeting at the top right of the first page, beside the header, with "meeting" and
 * its number right-aligned beneath; and a reply's REPLY centred at the foot of every page.
 */
const LETTER_PAGE = {
  marginsMm: { top: 37.6, side: 25, bottom: 35 },
  qr: { leftMm: 170.08, topMm: 36.65, sizeMm: 13.74 },
  label: { rightMm: 183.1, baselinesMm: [53.83, 57.63], sizePt: 9 },
  stamp: { baselineMm: 270.65, sizePt: 16 },
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
  const meeting = element.querySelector<HTMLElement>("[data-meeting-qr]");
  const qr = meeting?.querySelector("canvas");
  if (meeting && qr) drawMeetingQr(pdf, qr, meeting.dataset.meetingQr ?? "");
  if (element.dataset.pageStamp) drawPageStamp(pdf, element.dataset.pageStamp);
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

/** On the first page only: the header it sits beside is only there. */
function drawMeetingQr(pdf: jsPDF, qr: HTMLCanvasElement, meetingId: string): void {
  const { qr: box, label } = LETTER_PAGE;
  pdf.setPage(1);
  pdf.addImage(qr.toDataURL("image/png"), "PNG", box.leftMm * PT_PER_MM, box.topMm * PT_PER_MM, box.sizeMm * PT_PER_MM, box.sizeMm * PT_PER_MM);
  pdf.setFont("Arimo", "normal");
  pdf.setFontSize(label.sizePt);
  pdf.setTextColor(0);
  ["meeting", `#${meetingId}`].forEach((line, index) => {
    pdf.text(line, label.rightMm * PT_PER_MM, label.baselinesMm[index] * PT_PER_MM, { align: "right" });
  });
}

/** On every page, so each sheet hung on the wall says what it is. */
function drawPageStamp(pdf: jsPDF, stamp: string): void {
  const centre = pdf.internal.pageSize.getWidth() / 2;
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFont("Arimo", "bold");
    pdf.setFontSize(LETTER_PAGE.stamp.sizePt);
    pdf.setTextColor(0);
    pdf.text(stamp, centre, LETTER_PAGE.stamp.baselineMm * PT_PER_MM, { align: "center" });
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
