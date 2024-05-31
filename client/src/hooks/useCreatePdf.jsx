import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { marked } from "marked";

function useCreatePdf() {
  async function createPdf(content, meetingId) {
    // Parse Markdown to HTML
    const htmlContent = createHtmlFromMarkup(content);

    // Create a hidden element to hold the HTML content
    const hiddenDiv = document.createElement("div");
    hiddenDiv.innerHTML = htmlContent;
    hiddenDiv.style.position = "absolute";
    hiddenDiv.style.top = "-9999px";
    document.body.appendChild(hiddenDiv);

    // Convert the HTML to a canvas
    const canvas = await html2canvas(hiddenDiv);
    document.body.removeChild(hiddenDiv);

    // Create the PDF from the canvas
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    // Save the PDF with the meeting ID in the file name
    pdf.save(`Council of Foods Meeting Summary #${meetingId}.pdf`);
  }

  function createHtmlFromMarkup(markup) {
    // Parse Markdown to HTML
    const htmlContent = marked(markup);

    // Return the HTML content
    return htmlContent;
  }

  return { createPdf, createHtmlFromMarkup };
}

export default useCreatePdf;
