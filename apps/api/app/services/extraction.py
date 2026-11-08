"""Document text extraction with strict type and magic-byte validation."""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from charset_normalizer import from_bytes
from docx import Document as DocxDocument
from openpyxl import load_workbook
from PIL import Image
from pypdf import PdfReader

from app.core.errors import AppError

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".log", ".yaml", ".yml", ".html", ".htm", ".xml"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".xlsx", ".xlsm", ".csv", ".json", ".txt", ".md", ".markdown",
    ".log", ".yaml", ".yml", ".html", ".htm", ".xml", *IMAGE_EXTENSIONS,
}
MAX_PDF_PAGES = 300
MAX_SPREADSHEET_ROWS = 5000
MAX_TEXT_CHARS = 2_000_000


@dataclass(slots=True)
class ExtractedDocument:
    text: str
    page_count: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


def _decode(data: bytes) -> str:
    best = from_bytes(data).best()
    if best is None:
        return data.decode("utf-8", errors="replace")
    return str(best)


def _check_magic(data: bytes, extension: str) -> None:
    if extension == ".pdf" and not data.startswith(b"%PDF-"):
        raise AppError("invalid_file", "File is not a valid PDF", 415)
    if extension in {".docx", ".xlsx", ".xlsm"} and not data.startswith(b"PK\x03\x04"):
        raise AppError("invalid_file", "File is not a valid Office document", 415)
    if extension in IMAGE_EXTENSIONS:
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.verify()
        except Exception as exc:
            raise AppError("invalid_file", "Image could not be verified", 415) from exc


def validate_upload(filename: str, mime_type: str, data: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise AppError(
            "unsupported_file",
            f"Unsupported file type. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
            415,
        )
    if not data:
        raise AppError("invalid_file", "File is empty", 422)
    _check_magic(data, extension)
    return extension


def _pdf(data: bytes) -> ExtractedDocument:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise AppError("encrypted_file", "Password-protected PDFs are not supported", 415) from exc
        pages = reader.pages[:MAX_PDF_PAGES]
        texts = []
        for page in pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        text = "\n\n".join(texts).strip()
        meta: dict[str, Any] = {
            "pages": len(reader.pages),
            "truncated": len(reader.pages) > MAX_PDF_PAGES,
        }
        if not text:
            meta["warning"] = "No embedded text found; this may be a scanned PDF. Upload page images for vision analysis."
        return ExtractedDocument(text=text[:MAX_TEXT_CHARS], page_count=len(reader.pages), meta=meta)
    except AppError:
        raise
    except Exception as exc:
        raise AppError("extraction_failed", "Could not read this PDF", 422) from exc


def _docx(data: bytes) -> ExtractedDocument:
    try:
        document = DocxDocument(io.BytesIO(data))
        parts: list[str] = []
        for paragraph in document.paragraphs:
            if paragraph.text.strip():
                parts.append(paragraph.text.strip())
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    parts.append(" | ".join(cells))
        text = "\n".join(parts)
        return ExtractedDocument(
            text=text[:MAX_TEXT_CHARS],
            page_count=0,
            meta={"paragraphs": len(document.paragraphs), "tables": len(document.tables)},
        )
    except Exception as exc:
        raise AppError("extraction_failed", "Could not read this DOCX file", 422) from exc


def _xlsx(data: bytes) -> ExtractedDocument:
    try:
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        parts: list[str] = []
        rows_total = 0
        for sheet in workbook.worksheets[:8]:
            parts.append(f"## Sheet: {sheet.title}")
            for row_index, row in enumerate(sheet.iter_rows(values_only=True)):
                if row_index >= MAX_SPREADSHEET_ROWS:
                    parts.append("[sheet truncated]")
                    break
                values = ["" if value is None else str(value) for value in row]
                if any(values):
                    parts.append(" | ".join(values))
                    rows_total += 1
            parts.append("")
        text = "\n".join(parts)
        return ExtractedDocument(
            text=text[:MAX_TEXT_CHARS],
            page_count=len(workbook.worksheets),
            meta={"sheets": len(workbook.worksheets), "rows": rows_total},
        )
    except Exception as exc:
        raise AppError("extraction_failed", "Could not read this spreadsheet", 422) from exc


def _csv(data: bytes) -> ExtractedDocument:
    try:
        text = _decode(data)
        sample = text[:8192]
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        reader = csv.reader(io.StringIO(text), dialect)
        rows = []
        for index, row in enumerate(reader):
            if index >= MAX_SPREADSHEET_ROWS:
                rows.append(["[truncated]"])
                break
            rows.append(row)
        output = "\n".join(" | ".join(cell.strip() for cell in row) for row in rows)
        return ExtractedDocument(
            text=output[:MAX_TEXT_CHARS],
            page_count=0,
            meta={"rows": len(rows), "columns": max((len(row) for row in rows), default=0)},
        )
    except Exception as exc:
        raise AppError("extraction_failed", "Could not parse this CSV file", 422) from exc


def _json(data: bytes) -> ExtractedDocument:
    try:
        parsed = json.loads(_decode(data))
        text = json.dumps(parsed, indent=2, ensure_ascii=False)
        return ExtractedDocument(
            text=text[:MAX_TEXT_CHARS],
            meta={"kind": "json", "top_level": type(parsed).__name__},
        )
    except json.JSONDecodeError as exc:
        raise AppError("extraction_failed", f"Invalid JSON: {exc.msg} at line {exc.lineno}", 422) from exc


def _text(data: bytes) -> ExtractedDocument:
    return ExtractedDocument(text=_decode(data)[:MAX_TEXT_CHARS], meta={"kind": "text"})


def _image(data: bytes) -> ExtractedDocument:
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            return ExtractedDocument(
                text="",
                meta={
                    "kind": "image",
                    "width": width,
                    "height": height,
                    "format": image.format,
                    "mode": image.mode,
                    "needs_vision": True,
                },
            )
    except Exception as exc:
        raise AppError("extraction_failed", "Could not read this image", 422) from exc


def extract_document(data: bytes, filename: str, mime_type: str) -> ExtractedDocument:
    extension = validate_upload(filename, mime_type, data)
    if extension == ".pdf":
        return _pdf(data)
    if extension == ".docx":
        return _docx(data)
    if extension in {".xlsx", ".xlsm"}:
        return _xlsx(data)
    if extension == ".csv":
        return _csv(data)
    if extension == ".json":
        return _json(data)
    if extension in IMAGE_EXTENSIONS:
        return _image(data)
    return _text(data)


def is_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in IMAGE_EXTENSIONS
