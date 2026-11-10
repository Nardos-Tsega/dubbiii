"""Convert Markdown text into downloadable docx / pdf / md / txt files."""

from __future__ import annotations

import io
import re
from datetime import date
from pathlib import Path
from typing import Literal

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from fpdf import FPDF

ExportFormat = Literal["docx", "md", "pdf", "txt"]

FONTS_DIR = Path(__file__).resolve().parent / "fonts"
DEJAVU_REGULAR = FONTS_DIR / "DejaVuSans.ttf"
DEJAVU_BOLD = FONTS_DIR / "DejaVuSans-Bold.ttf"

CONTENT_TYPES: dict[ExportFormat, str] = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "md": "text/markdown; charset=utf-8",
    "pdf": "application/pdf",
    "txt": "text/plain; charset=utf-8",
}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
UL_RE = re.compile(r"^[-*+]\s+(.*)$")
OL_RE = re.compile(r"^(\d+)[.)]\s+(.*)$")
TABLE_ROW_RE = re.compile(r"^\|(.+)\|$")
TABLE_SEP_RE = re.compile(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$")
BOLD_ITALIC_RE = re.compile(r"(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)")


def clean_filename(title: str) -> str:
    cleaned = title.strip() or "gemini_deebii"
    cleaned = re.sub(r"[^\w\s\-'.]", "", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = cleaned.strip("._") or "gemini_deebii"
    return cleaned[:80]


def build_download_filename(title: str, fmt: ExportFormat) -> str:
    return f"{clean_filename(title)}_{date.today().isoformat()}.{fmt}"


def _split_inline_runs(text: str) -> list[tuple[str, bool, bool]]:
    """Return (text, bold, italic) runs for a markdown inline string."""
    runs: list[tuple[str, bool, bool]] = []
    last = 0
    for match in BOLD_ITALIC_RE.finditer(text):
        if match.start() > last:
            runs.append((text[last : match.start()], False, False))
        token = match.group(0)
        if token.startswith("***") and token.endswith("***"):
            runs.append((token[3:-3], True, True))
        elif token.startswith("**") and token.endswith("**"):
            runs.append((token[2:-2], True, False))
        elif token.startswith("*") and token.endswith("*"):
            runs.append((token[1:-1], False, True))
        elif token.startswith("_") and token.endswith("_"):
            runs.append((token[1:-1], False, True))
        else:
            runs.append((token, False, False))
        last = match.end()
    if last < len(text):
        runs.append((text[last:], False, False))
    return runs or [(text, False, False)]


def _strip_md_inline(text: str) -> str:
    return "".join(chunk for chunk, _, _ in _split_inline_runs(text))


def _parse_table_row(line: str) -> list[str]:
    inner = line.strip().strip("|")
    return [cell.strip() for cell in inner.split("|")]


def _iter_blocks(text: str):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        heading = HEADING_RE.match(stripped)
        if heading:
            yield ("heading", len(heading.group(1)), heading.group(2).strip())
            i += 1
            continue

        if TABLE_ROW_RE.match(stripped):
            rows: list[list[str]] = []
            while i < len(lines) and TABLE_ROW_RE.match(lines[i].strip()):
                row_line = lines[i].strip()
                if TABLE_SEP_RE.match(row_line):
                    i += 1
                    continue
                rows.append(_parse_table_row(row_line))
                i += 1
            if rows:
                yield ("table", rows)
            continue

        ul = UL_RE.match(stripped)
        if ul:
            items: list[str] = []
            while i < len(lines):
                match = UL_RE.match(lines[i].strip())
                if not match:
                    break
                items.append(match.group(1).strip())
                i += 1
            yield ("ul", items)
            continue

        ol = OL_RE.match(stripped)
        if ol:
            items = []
            while i < len(lines):
                match = OL_RE.match(lines[i].strip())
                if not match:
                    break
                items.append(match.group(2).strip())
                i += 1
            yield ("ol", items)
            continue

        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or HEADING_RE.match(nxt)
                or UL_RE.match(nxt)
                or OL_RE.match(nxt)
                or TABLE_ROW_RE.match(nxt)
            ):
                break
            para_lines.append(nxt)
            i += 1
        yield ("paragraph", " ".join(para_lines))


def _set_docx_run_font(run, bold: bool = False, italic: bool = False, size_pt: float = 11) -> None:
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size_pt)
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")


def _add_docx_inline(paragraph, text: str, size_pt: float = 11) -> None:
    for chunk, bold, italic in _split_inline_runs(text):
        if not chunk:
            continue
        run = paragraph.add_run(chunk)
        _set_docx_run_font(run, bold=bold, italic=italic, size_pt=size_pt)


def render_docx(text: str, title: str) -> bytes:
    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    heading = document.add_heading(title, level=1)
    for run in heading.runs:
        run.font.color.rgb = RGBColor(0x1F, 0x1C, 0x18)

    for block in _iter_blocks(text):
        kind = block[0]
        if kind == "heading":
            _, level, content = block
            p = document.add_heading("", level=min(max(level, 1), 4))
            _add_docx_inline(p, content, size_pt=max(12, 18 - level))
        elif kind == "paragraph":
            _, content = block
            p = document.add_paragraph()
            _add_docx_inline(p, content)
        elif kind == "ul":
            _, items = block
            for item in items:
                p = document.add_paragraph(style="List Bullet")
                if p.runs:
                    p.runs[0].text = ""
                _add_docx_inline(p, item)
        elif kind == "ol":
            _, items = block
            for item in items:
                p = document.add_paragraph(style="List Number")
                if p.runs:
                    p.runs[0].text = ""
                _add_docx_inline(p, item)
        elif kind == "table":
            _, rows = block
            cols = max(len(row) for row in rows)
            table = document.add_table(rows=len(rows), cols=cols)
            table.style = "Table Grid"
            for r_idx, row in enumerate(rows):
                for c_idx in range(cols):
                    cell = table.cell(r_idx, c_idx)
                    cell.text = ""
                    paragraph = cell.paragraphs[0]
                    value = row[c_idx] if c_idx < len(row) else ""
                    _add_docx_inline(paragraph, value, size_pt=10)
                    if r_idx == 0:
                        for run in paragraph.runs:
                            run.bold = True

    document.add_paragraph("")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


class _UnicodePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("DejaVu", size=9)
        self.set_text_color(120)
        self.cell(0, 10, f"{self.page_no()}", align="C")


def render_pdf(text: str, title: str) -> bytes:
    if not DEJAVU_REGULAR.exists() or not DEJAVU_BOLD.exists():
        raise FileNotFoundError(
            "DejaVu fonts missing. Expected server/fonts/DejaVuSans.ttf and DejaVuSans-Bold.ttf"
        )

    pdf = _UnicodePDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.add_font("DejaVu", "", str(DEJAVU_REGULAR))
    pdf.add_font("DejaVu", "B", str(DEJAVU_BOLD))
    pdf.add_font("DejaVu", "I", str(DEJAVU_REGULAR))

    pdf.set_font("DejaVu", "B", 16)
    pdf.multi_cell(0, 9, title)
    pdf.ln(4)

    usable_width = pdf.w - pdf.l_margin - pdf.r_margin

    for block in _iter_blocks(text):
        kind = block[0]
        if kind == "heading":
            _, level, content = block
            size = max(12, 18 - level)
            pdf.set_font("DejaVu", "B", size)
            pdf.multi_cell(0, size * 0.55, _strip_md_inline(content))
            pdf.ln(2)
        elif kind == "paragraph":
            _, content = block
            _pdf_write_inline(pdf, content, size=11)
            pdf.ln(3)
        elif kind == "ul":
            _, items = block
            for item in items:
                pdf.set_font("DejaVu", size=11)
                pdf.cell(6, 6, "-")
                _pdf_write_inline(pdf, item, size=11, indent=0)
                pdf.ln(1)
            pdf.ln(2)
        elif kind == "ol":
            _, items = block
            for idx, item in enumerate(items, start=1):
                pdf.set_font("DejaVu", size=11)
                pdf.cell(8, 6, f"{idx}.")
                _pdf_write_inline(pdf, item, size=11, indent=0)
                pdf.ln(1)
            pdf.ln(2)
        elif kind == "table":
            _, rows = block
            cols = max(len(row) for row in rows)
            col_width = usable_width / cols
            for r_idx, row in enumerate(rows):
                for c_idx in range(cols):
                    value = _strip_md_inline(row[c_idx] if c_idx < len(row) else "")
                    pdf.set_font("DejaVu", "B" if r_idx == 0 else "", 9)
                    x = pdf.get_x()
                    y = pdf.get_y()
                    pdf.multi_cell(col_width, 6, value, border=1)
                    # Move to next cell on same row
                    if c_idx < cols - 1:
                        pdf.set_xy(x + col_width, y)
                pdf.ln(0)
            pdf.ln(3)

    out = pdf.output()
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return str(out).encode("latin-1")


def _pdf_write_inline(pdf: FPDF, text: str, size: float = 11, indent: float = 0) -> None:
    pdf.set_x(pdf.l_margin + indent)
    for chunk, bold, italic in _split_inline_runs(text):
        style = ""
        if bold and italic:
            style = "BI"
        elif bold:
            style = "B"
        elif italic:
            style = "I"
        # fpdf2 may not have BI for custom fonts; fall back to B
        if style == "BI":
            style = "B"
        pdf.set_font("DejaVu", style, size)
        pdf.write(size * 0.55, chunk)
    pdf.ln(size * 0.55)


def render_markdown(text: str, title: str) -> bytes:
    body = text if text.lstrip().startswith("#") else f"# {title}\n\n{text}"
    return body.encode("utf-8")


def render_txt(text: str, title: str) -> bytes:
    plain_lines: list[str] = [title, "=" * len(title), ""]
    for block in _iter_blocks(text):
        kind = block[0]
        if kind == "heading":
            _, level, content = block
            plain_lines.append(_strip_md_inline(content))
            plain_lines.append("-" if level > 1 else "=")
            plain_lines.append("")
        elif kind == "paragraph":
            plain_lines.append(_strip_md_inline(block[1]))
            plain_lines.append("")
        elif kind == "ul":
            for item in block[1]:
                plain_lines.append(f"- {_strip_md_inline(item)}")
            plain_lines.append("")
        elif kind == "ol":
            for idx, item in enumerate(block[1], start=1):
                plain_lines.append(f"{idx}. {_strip_md_inline(item)}")
            plain_lines.append("")
        elif kind == "table":
            rows = block[1]
            for row in rows:
                plain_lines.append(" | ".join(_strip_md_inline(cell) for cell in row))
            plain_lines.append("")
    return "\n".join(plain_lines).encode("utf-8")


def render_export(text: str, fmt: ExportFormat, title: str) -> bytes:
    if fmt == "docx":
        return render_docx(text, title)
    if fmt == "pdf":
        return render_pdf(text, title)
    if fmt == "md":
        return render_markdown(text, title)
    if fmt == "txt":
        return render_txt(text, title)
    raise ValueError(f"Unsupported format: {fmt}")
