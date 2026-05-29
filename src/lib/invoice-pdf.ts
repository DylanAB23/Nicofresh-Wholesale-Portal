import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function generateInvoicePDF(invoiceNumber: string, invoiceId: string) {
  try {
    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '210mm'; // A4 width
    container.style.padding = '20mm';
    container.style.background = 'white';

    // Generate invoice HTML
    const html = generateInvoiceHTML({
      invoiceNumber,
      invoiceId,
    });

    container.innerHTML = html;
    document.body.appendChild(container);

    // Convert to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10;

    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${invoiceNumber}.pdf`);
    document.body.removeChild(container);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  }
}

function generateInvoiceHTML({ invoiceNumber, invoiceId }: { invoiceNumber: string; invoiceId: string }) {
  // Fetch invoice data and generate HTML
  // For now, return a basic template - data will be injected from the modal
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px;">
      <h1>Invoice ${invoiceNumber}</h1>
      <p>Invoice ID: ${invoiceId}</p>
    </div>
  `;
}
