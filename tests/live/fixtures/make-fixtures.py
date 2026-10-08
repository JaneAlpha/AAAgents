# -*- coding: utf-8 -*-
"""生成测试用夹具：一份 .docx（中文业务事实）与一份 .pdf（英文事实）。"""
import os
import zipfile

OUT = os.path.dirname(os.path.abspath(__file__))

DOC_PARAS = [
    "企业套期保值政策（2026年度）",
    "一、品种与合约：本企业从事苹果贸易，期货品种为苹果（AP），合约乘数 10 吨/手。",
    "二、授权：套期保值授权比例 0.7，上限 0.8；所有保值须经业务负责人、独立风控、企业授权审批人三级复核。",
    "三、原则：以锁定经营毛利为目标，优先使用期货与保护性期权，禁止裸卖与投机。",
]

PDF_LINES = [
    "Inventory and Market Note",
    "Company: apple trading. Inventory: 240 tons, grade A red fuji, stored in Qixia warehouse.",
    "Quotes: AP2612 settle 8500 CNY per ton; AP2701 settle 8620 CNY per ton.",
    "Hedge horizon: 2026-12-15. No derivative positions currently held.",
]


def esc_xml(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def make_docx(path, paragraphs):
    body = "".join(
        '<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % esc_xml(p) for p in paragraphs
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>%s</w:body></w:document>" % body
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)


def esc_pdf(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(path, lines):
    ops = "BT /F1 12 Tf 72 740 Td 16 TL\n"
    for line in lines:
        ops += "(%s) Tj T*\n" % esc_pdf(line)
    ops += "ET"
    stream = ops.encode("latin-1", "replace")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objs, start=1):
        offsets.append(len(out))
        out += ("%d 0 obj\n" % i).encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += ("xref\n0 %d\n" % (len(objs) + 1)).encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref_pos)).encode()
    with open(path, "wb") as f:
        f.write(bytes(out))


if __name__ == "__main__":
    docx_path = os.path.join(OUT, "policy.docx")
    pdf_path = os.path.join(OUT, "inventory.pdf")
    make_docx(docx_path, DOC_PARAS)
    make_pdf(pdf_path, PDF_LINES)
    print("wrote", docx_path, os.path.getsize(docx_path), "bytes")
    print("wrote", pdf_path, os.path.getsize(pdf_path), "bytes")
