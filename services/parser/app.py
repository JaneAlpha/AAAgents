# -*- coding: utf-8 -*-
"""文档解析服务：接收上传文件，按类型抽取纯文本。

- .docx：OOXML 为 ZIP 包，直接读 word/document.xml 用标准库抽取（无需第三方库）
- .pdf ：使用 pypdf 抽取文本
- .md/.txt：按 UTF-8 文本读取

以 multipart/form-data 接收字段 file，返回 {"text": "..."}。
"""
import html
import io
import os
import re
import zipfile

from flask import Flask, jsonify, request
from pypdf import PdfReader

app = Flask(__name__)

SUPPORTED = {"docx", "pdf", "md", "txt"}


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def docx_to_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"<w:tab[^>]*/>", "\t", xml)
    xml = re.sub(r"<w:br[^>]*/>", "\n", xml)
    xml = xml.replace("</w:p>", "\n")
    text = re.sub(r"<[^>]+>", "", xml)
    return html.unescape(text)


def pdf_to_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/parse")
def parse():
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "缺少文件字段 file"}), 400

    name = file.filename or ""
    ext = _ext(name)
    if ext not in SUPPORTED:
        return jsonify({"error": f"不支持的文件类型：{ext or '(无扩展名)'}"}), 400

    data = file.read()
    try:
        if ext == "docx":
            text = docx_to_text(data)
        elif ext == "pdf":
            text = pdf_to_text(data)
        else:
            text = data.decode("utf-8", "ignore")
    except Exception as exc:  # noqa: BLE001 - 向上返回可读错误
        return jsonify({"error": f"解析失败：{exc}"}), 422

    return jsonify({"text": text, "ext": ext, "chars": len(text)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PARSER_PORT", "8000")))
