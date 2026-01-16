const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Generate a Tenant Trust Profile PDF stream
// data: { tenant, paymentsSummary, defaults, complaints, inspectionImagePaths }
function generateTrustProfilePDF(data, outStream) {
  const doc = new PDFDocument({ autoFirstPage: false });

  doc.addPage({ size: 'A4', margin: 50 });

  doc.fontSize(18).text('Tenant Trust Profile', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Name: ${data.tenant.firstname} ${data.tenant.lastname}`);
  doc.text(`Email: ${data.tenant.email || 'N/A'}`);
  doc.text(`Phone: ${data.tenant.phonenumber || 'N/A'}`);
  doc.moveDown();

  doc.fontSize(14).text('Payment punctuality', { underline: true });
  doc.fontSize(11).text(`On-time payment rate: ${((data.paymentsSummary && data.paymentsSummary.onTimeRate) || data.tenant.onTimeRate || 0)}`);
  doc.text(`Average delay days: ${((data.paymentsSummary && data.paymentsSummary.avgDelayDays) || data.tenant.avgDelayDays || 0)}`);
  doc.moveDown();

  doc.fontSize(14).text('Default history', { underline: true });
  if (data.defaults && data.defaults.length) {
    data.defaults.forEach(d => {
      doc.fontSize(11).text(`- ${d}`);
    });
  } else {
    doc.fontSize(11).text('No defaults found in the period.');
  }
  doc.moveDown();

  doc.fontSize(14).text('Complaints', { underline: true });
  if (data.complaints && data.complaints.length) {
    data.complaints.forEach(c => {
      doc.fontSize(11).text(`- [${new Date(c.createdAt).toLocaleDateString()}] ${c.title} (${c.severity || 'N/A'})`);
    });
  } else {
    doc.fontSize(11).text('No complaints recorded.');
  }
  doc.addPage();

  doc.fontSize(16).text('Property inspection images', { underline: true });
  doc.moveDown();

  const images = data.inspectionImagePaths || [];
  let x = 50, y = doc.y;
  images.slice(0, 6).forEach((imgPath, idx) => {
    try {
      if (fs.existsSync(imgPath)) {
        const imgX = 50 + (idx % 2) * 260;
        const imgY = y + Math.floor(idx / 2) * 180;
        doc.image(imgPath, imgX, imgY, { fit: [240, 160], align: 'center', valign: 'center' });
      }
    } catch (e) {
      // skip
    }
  });

  // pipe to provided stream
  doc.pipe(outStream);
  doc.end();
  return outStream;
}

module.exports = { generateTrustProfilePDF };
