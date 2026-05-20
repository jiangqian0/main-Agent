# Document Generation API — PDF / DOCX / PPTX

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os
import uuid
import datetime

router = APIRouter(prefix="/api/docs", tags=["Documents"])

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "generated_docs")
os.makedirs(DOCS_DIR, exist_ok=True)


class GenerateRequest(BaseModel):
    title: str
    content: str
    format: str = "pdf"  # pdf, docx, pptx, md
    template: Optional[str] = None
    sections: Optional[dict] = None


# ─── Shared helpers ─────────────────────────────────────────────────────────────

def _safe_filename(title: str) -> str:
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:50]
    return safe or "document"


# ─── PDF (reportlab Platypus) ──────────────────────────────────────────────────

def _generate_pdf(title: str, content: str, timestamp: str) -> dict:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    filename = f"{_safe_filename(title)}_{timestamp}.pdf"
    filepath = os.path.join(DOCS_DIR, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Title'],
        fontSize=22, leading=28, spaceAfter=6,
        textColor=colors.HexColor('#1a1a2e'),
    )
    meta_style = ParagraphStyle(
        'Meta', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#666666'),
        spaceAfter=12,
    )
    body_style = ParagraphStyle(
        'Body', parent=styles['Normal'],
        fontSize=11, leading=16, spaceAfter=8,
        textColor=colors.HexColor('#333333'),
    )

    story = []

    # Title
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(
        f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}",
        meta_style
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#00693e'), spaceAfter=16))

    # Content — split into lines, handle paragraphs
    paragraphs = content.split('\n\n')
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if para.startswith('# '):
            story.append(Paragraph(para[2:], title_style))
        elif para.startswith('## '):
            story.append(Paragraph(para[3:], styles['Heading2']))
        elif para.startswith('### '):
            story.append(Paragraph(para[4:], styles['Heading3']))
        elif para.startswith('- '):
            for item in para.split('\n'):
                item = item.strip()
                if item.startswith('- '):
                    story.append(Paragraph(f"• {item[2:]}", body_style))
        elif '\n' in para and ('|' in para or '+' in para):
            # Simple table: lines separated by |
            lines = [l for l in para.split('\n') if l.strip()]
            if len(lines) >= 2:
                data = []
                for line in lines:
                    cells = [c.strip() for c in line.split('|') if c.strip() and not all(p in '- :|' for p in c.strip())]
                    if cells:
                        data.append(cells)
                if data:
                    t = Table(data, colWidths=None)
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#00693e')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ]))
                    story.append(t)
                    story.append(Spacer(1, 8))
        else:
            # Plain paragraph — wrap long lines
            para_clean = para.replace('\n', ' ')
            story.append(Paragraph(para_clean, body_style))

    doc.build(story)
    return {
        "success": True,
        "title": title,
        "format": "pdf",
        "download_url": f"/api/docs/download/{filename}",
        "filename": filename,
        "size": os.path.getsize(filepath),
    }


# ─── DOCX (python-docx) ───────────────────────────────────────────────────────

def _generate_docx(title: str, content: str, timestamp: str) -> dict:
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.style import WD_STYLE_TYPE

    filename = f"{_safe_filename(title)}_{timestamp}.docx"
    filepath = os.path.join(DOCS_DIR, filename)

    doc = Document()

    # Title
    title_para = doc.add_heading(title, level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for run in title_para.runs:
        run.font.color.rgb = RGBColor(0x1a, 0x1a, 0x2e)

    # Meta
    meta = doc.add_paragraph(
        f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )
    meta.runs[0].font.size = Pt(10)
    meta.runs[0].font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    meta.runs[0].font.italic = True

    doc.add_paragraph()

    # Content
    paragraphs = content.split('\n\n')
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if para.startswith('# '):
            doc.add_heading(para[2:], level=1)
        elif para.startswith('## '):
            doc.add_heading(para[3:], level=2)
        elif para.startswith('### '):
            doc.add_heading(para[4:], level=3)
        elif para.startswith('- '):
            for item in para.split('\n'):
                item = item.strip()
                if item.startswith('- '):
                    p = doc.add_paragraph(item[2:], style='List Bullet')
        elif '\n' in para and '|' in para:
            lines = [l.strip() for l in para.split('\n') if l.strip()]
            # Skip table separator lines
            data_lines = [l for l in lines if not all(c in '-|: ' for c in l)]
            if len(data_lines) >= 2:
                headers = [c.strip() for c in data_lines[0].split('|') if c.strip()]
                table = doc.add_table(rows=1, cols=len(headers))
                table.style = 'Table Grid'
                hdr_cells = table.rows[0].cells
                for i, h in enumerate(headers):
                    hdr_cells[i].text = h
                    for run in hdr_cells[i].paragraphs[0].runs:
                        run.font.bold = True
                        run.font.color.rgb = RGBColor(0xff, 0xff, 0xff)
                    hdr_cells[i].paragraphs[0].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for row_data in data_lines[1:]:
                    cells = [c.strip() for c in row_data.split('|') if c.strip()]
                    if len(cells) == len(headers):
                        row = table.add_row().cells
                        for i, c in enumerate(cells):
                            row[i].text = c
                doc.add_paragraph()
        else:
            p = doc.add_paragraph(para.replace('\n', ' '))

    doc.save(filepath)
    return {
        "success": True,
        "title": title,
        "format": "docx",
        "download_url": f"/api/docs/download/{filename}",
        "filename": filename,
        "size": os.path.getsize(filepath),
    }


# ─── PPTX (python-pptx) ──────────────────────────────────────────────────────

def _generate_pptx(title: str, content: str, timestamp: str) -> dict:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Emu

    filename = f"{_safe_filename(title)}_{timestamp}.pptx"
    filepath = os.path.join(DOCS_DIR, filename)

    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    def add_slide_with_title(slide_title: str, content_lines: List[str]):
        slide_layout = prs.slide_layouts[6]  # Blank
        slide = prs.slides.add_slide(slide_layout)

        # Title bar background
        from pptx.shapes.base import BaseShape
        from pptx.oxml.ns import qn
        left = Inches(0); top = Inches(0); width = prs.slide_width; height = Inches(1.2)
        shape = slide.shapes.add_shape(1, left, top, width, height)  # MSO_SHAPE_TYPE.RECTANGLE = 1
        shape.fill.solid(); shape.fill.fore_color.rgb = RGBColor(0x00, 0x69, 0x3e)
        shape.line.fill.background()

        # Title text
        txbox = slide.shapes.add_textbox(Inches(0.5), Inches(0.25), Inches(12), Inches(0.7))
        tf = txbox.text_frame
        p = tf.paragraphs[0]
        p.text = slide_title
        p.font.size = Pt(28)
        p.font.bold = True
        p.font.color.rgb = RGBColor(0xff, 0xff, 0xff)

        # Content
        txbox2 = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(12), Inches(5.5))
        tf2 = txbox2.text_frame
        tf2.word_wrap = True

        for i, line in enumerate(content_lines[:20]):
            line = line.strip()
            if not line:
                continue
            if i == 0:
                p2 = tf2.paragraphs[0]
            else:
                p2 = tf2.add_paragraph()
            p2.text = line
            p2.font.size = Pt(16)
            p2.font.color.rgb = RGBColor(0x1a, 0x1a, 0x2e)
            if line.startswith('- '):
                p2.text = f"  • {line[2:]}"
                p2.font.size = Pt(14)
                p2.font.color.rgb = RGBColor(0x44, 0x44, 0x44)
            elif line.startswith('#'):
                p2.font.bold = True
                p2.font.size = Pt(20)

    # Split content into slides by H2 headings or every ~8 lines
    paragraphs = content.split('\n\n')
    slide_content = []
    slide_title = title

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if para.startswith('## ') or para.startswith('##'):
            # Start new slide
            heading = para.lstrip('#').strip()
            add_slide_with_title(slide_title, slide_content)
            slide_title = heading
            slide_content = []
        else:
            for line in para.split('\n'):
                if line.strip():
                    slide_content.append(line.strip())

    # Last slide
    add_slide_with_title(slide_title, slide_content)

    # Title slide
    title_layout = prs.slide_layouts[6]
    title_slide = prs.slides.add_slide(title_layout)
    ts = title_slide.shapes.add_textbox(Inches(1), Inches(2.5), Inches(11), Inches(2))
    tf = ts.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = RGBColor(0x00, 0x69, 0x3e)
    p.alignment = PP_ALIGN.CENTER

    ts2 = title_slide.shapes.add_textbox(Inches(1), Inches(4.5), Inches(11), Inches(0.8))
    tf2 = ts2.text_frame
    p2 = tf2.paragraphs[0]
    p2.text = f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    p2.font.size = Pt(18)
    p2.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    p2.alignment = PP_ALIGN.CENTER

    prs.save(filepath)
    return {
        "success": True,
        "title": title,
        "format": "pptx",
        "download_url": f"/api/docs/download/{filename}",
        "filename": filename,
        "size": os.path.getsize(filepath),
    }


# ─── API Routes ────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_document(req: GenerateRequest):
    """Generate a document in PDF, DOCX, PPTX, or Markdown format."""
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = _safe_filename(req.title)

        if req.format == "md":
            filename = f"{safe_title}_{timestamp}.md"
            filepath = os.path.join(DOCS_DIR, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(f"# {req.title}\n\n")
                f.write(f"_Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}_\n\n")
                f.write(req.content)
            return {
                "success": True,
                "title": req.title,
                "format": "md",
                "download_url": f"/api/docs/download/{filename}",
                "filename": filename,
                "size": os.path.getsize(filepath),
            }

        elif req.format == "pdf":
            return _generate_pdf(req.title, req.content, timestamp)

        elif req.format == "docx":
            return _generate_docx(req.title, req.content, timestamp)

        elif req.format == "pptx":
            return _generate_pptx(req.title, req.content, timestamp)

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {req.format}")

    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Missing dependency for {req.format} generation. Install: pip install {'reportlab python-docx python-pptx' if 'pdf' in str(e) else str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_documents():
    """List all generated documents."""
    try:
        files = []
        if os.path.exists(DOCS_DIR):
            for f in sorted(os.listdir(DOCS_DIR), key=lambda x: os.path.getmtime(os.path.join(DOCS_DIR, x)), reverse=True):
                filepath = os.path.join(DOCS_DIR, f)
                stat = os.stat(filepath)
                files.append({
                    "filename": f,
                    "size": stat.st_size,
                    "created_at": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "modified_at": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
        return {"documents": files[:50]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_document(filename: str):
    """Download a generated document."""
    filename = os.path.basename(filename)
    filepath = os.path.join(DOCS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Document not found")
    from fastapi.responses import FileResponse
    return FileResponse(filepath, filename=filename, media_type="application/octet-stream")


@router.get("/preview/{filename}")
async def preview_document(filename: str):
    """Preview a generated document."""
    filename = os.path.basename(filename)
    filepath = os.path.join(DOCS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Document not found")
    from fastapi.responses import FileResponse
    if filename.endswith(".html") or filename.endswith(".md"):
        return FileResponse(filepath, media_type="text/html")
    return FileResponse(filepath, media_type="text/plain")


@router.delete("/{filename}")
async def delete_document(filename: str):
    """Delete a generated document."""
    filename = os.path.basename(filename)
    filepath = os.path.join(DOCS_DIR, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    return {"success": True}
