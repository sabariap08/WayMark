"""Minimal dependency-free PDF writer (single page, Helvetica text lines)."""


def _escape(text):
    return str(text or '').replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')


def build_pdf(title, lines):
    """Return PDF bytes containing a title and text lines."""
    body_parts = []
    body_parts.append('BT /F1 16 Tf 56 780 Td (' + _escape(title) + ') Tj ET')
    y = 748
    for line in lines:
        if y < 56:
            break
        body_parts.append('BT /F1 10 Tf 56 ' + str(y) + ' Td (' + _escape(line) + ') Tj ET')
        y -= 16
    stream = '\n'.join(body_parts)

    objects = []
    objects.append('<< /Type /Catalog /Pages 2 0 R >>')
    objects.append('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    objects.append('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>')
    objects.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    objects.append('<< /Length ' + str(len(stream.encode('latin-1', 'replace'))) + ' >>\nstream\n' + stream + '\nendstream')

    out = '%PDF-1.4\n'
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out.encode('latin-1', 'replace')))
        out += str(i) + ' 0 obj\n' + obj + '\nendobj\n'
    xref_pos = len(out.encode('latin-1', 'replace'))
    out += 'xref\n0 ' + str(len(objects) + 1) + '\n'
    out += '0000000000 65535 f \n'
    for off in offsets:
        out += str(off).zfill(10) + ' 00000 n \n'
    out += 'trailer\n<< /Size ' + str(len(objects) + 1) + ' /Root 1 0 R >>\nstartxref\n' + str(xref_pos) + '\n%%EOF\n'
    return out.encode('latin-1', 'replace')