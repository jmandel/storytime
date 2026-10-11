// Save a book as a PDF: one PDF page per book page, the picture on top and the words underneath (speaker tags
// removed). jsPDF is loaded only when someone downloads.
const plain = text => text.replace(/\[[^\]:]+:\s*([^\]]*)\]/g, '$1')

const imageSize = src => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight})
  img.onerror = reject
  img.src = src
})

export async function downloadPdf(book) {
  const {jsPDF} = await import('jspdf')
  const doc = new jsPDF({unit: 'pt', format: 'letter', orientation: 'landscape'})
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36
  for (const [i, page] of book.pages.entries()) {
    if (i) doc.addPage('letter', 'landscape')
    const words = doc.setFontSize(16).splitTextToSize(plain(page.text || ''), W - 2 * M)
    const textH = words.length * 20
    const {w, h} = await imageSize(page.img)
    const maxW = W - 2 * M, maxH = H - 2 * M - textH - (textH ? 16 : 0)
    const s = Math.min(maxW / w, maxH / h)
    doc.addImage(page.img, 'JPEG', (W - w * s) / 2, M, w * s, h * s)
    if (words.length) doc.text(words, M, M + h * s + 32)
    doc.setFontSize(9).setTextColor(140).text(page.label || `Page ${i}`, W - M, H - 16, {align: 'right'}).setTextColor(0)
  }
  const name = (book.collection ? `${book.collection.title} - ${book.title}` : book.title).replace(/[^\w\s'!,.-]/g, '')
  doc.save(`${name}.pdf`)
}
