#!/usr/bin/env python3
"""Build the frozen, data-only PDF baseline used by the local A/B harness."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "benchmark-baseline.pdf"


def load_dataset() -> dict:
    script = (
        "import { DATASET } from './data/raudenbush1985.js';"
        "process.stdout.write(JSON.stringify(DATASET));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


class InvariantCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        super().__init__(*args, **kwargs)
        self.setTitle("Living Evidence frozen PDF baseline v1")
        self.setAuthor("Living Evidence")
        self.setSubject("Data-only control artifact for the PDF vs WebMCP comparison")


def page_chrome(pdf, doc):
    pdf.saveState()
    width, height = A4
    pdf.setStrokeColor(colors.HexColor("#D9D4C9"))
    pdf.setLineWidth(0.5)
    pdf.line(18 * mm, height - 16 * mm, width - 18 * mm, height - 16 * mm)
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(colors.HexColor("#716B60"))
    pdf.drawString(18 * mm, height - 12 * mm, "LIVING EVIDENCE - FROZEN PDF BASELINE v1")
    pdf.drawRightString(width - 18 * mm, 11 * mm, f"Page {doc.page}")
    pdf.restoreState()


def build_pdf(dataset: dict) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=24, leading=29, textColor=colors.HexColor("#241F2E"),
        alignment=TA_CENTER, spaceAfter=10 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Deck", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=12, leading=18, textColor=colors.HexColor("#625B6F"),
        alignment=TA_CENTER, spaceAfter=8 * mm,
    ))
    styles.add(ParagraphStyle(
        name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
        fontSize=17, leading=21, textColor=colors.HexColor("#563B8E"),
        spaceBefore=4 * mm, spaceAfter=4 * mm,
    ))
    styles.add(ParagraphStyle(
        name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=11, leading=14, textColor=colors.HexColor("#241F2E"),
        spaceBefore=3 * mm, spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.5, leading=14, textColor=colors.HexColor("#2C2930"),
        spaceAfter=3 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Smallx", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=7.8, leading=10, textColor=colors.HexColor("#625F68"),
        spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold",
        fontSize=9.5, leading=14, textColor=colors.HexColor("#563B8E"),
        borderColor=colors.HexColor("#A992D6"), borderWidth=0.7,
        borderPadding=7, backColor=colors.HexColor("#F4F0FB"),
        spaceBefore=3 * mm, spaceAfter=4 * mm,
    ))

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=23 * mm, bottomMargin=18 * mm,
        title="Living Evidence frozen PDF baseline v1",
        author="Living Evidence",
    )
    story = []

    story.extend([
        Spacer(1, 27 * mm),
        Paragraph("Do Teacher Expectations Raise Students' IQ?", styles["CoverTitle"]),
        Paragraph(
            "A frozen, data-only baseline for comparing an ordinary PDF workflow with the "
            "WebMCP-native Living Evidence document.", styles["Deck"]
        ),
        Spacer(1, 5 * mm),
        Paragraph(
            "18 experiments / 19 effect-size records", styles["Callout"]
        ),
        Paragraph(
            "Baseline version: 2026-09-04.v1<br/>"
            "Analytic dataset: metadat::dat.raudenbush1985<br/>"
            "Synthesis DOI: 10.1037/0022-0663.76.1.85", styles["Bodyx"]
        ),
        Spacer(1, 17 * mm),
        Paragraph(
            "Purpose", styles["H1x"]
        ),
        Paragraph(
            "This file is the control artifact in a descriptive A/B evaluation. It contains the same "
            "study-level numbers and methods context as the web document, but no executable statistics, "
            "registered browser tools, or interactive audit trail. It is not evidence that either condition "
            "performs better.", styles["Bodyx"]
        ),
        Paragraph(
            "Traceability limit", styles["H2x"]
        ),
        Paragraph(
            "The yi and vi values are secondary-dataset transcriptions. Primary reports and effect-size "
            "derivations were not independently checked, and no structured risk-of-bias assessment is "
            "included. The comparison measures task execution on this frozen artifact, not scientific truth.",
            styles["Bodyx"]
        ),
        PageBreak(),
    ])

    story.extend([
        Paragraph("Evidence summary and model", styles["H1x"]),
        Paragraph(
            "The source reports 18 experiments. The table contains 19 effect-size records because the "
            "Pellegrini and Hicks (1972) experiment contributes separate aware-tester and blind-tester "
            "conditions (s04 and s05). The historical reference analysis treats the 19 rows as independent "
            "and does not model their within-experiment covariance.", styles["Bodyx"]
        ),
        Paragraph("Full-corpus reference result", styles["H2x"]),
        Paragraph(
            "A random-effects REML fit over all 19 records gives pooled SMD = 0.0837, 95% CI "
            "[-0.0175, 0.1849], two-sided p = 0.1051. These printed values make the full-corpus task "
            "an extraction control. Results for exclusion and Egger tasks are intentionally not printed.",
            styles["Callout"]
        ),
        Paragraph("Statistical specification", styles["H2x"]),
        Paragraph(
            "Each observed standardized mean difference yi has known sampling variance vi. The random-effects "
            "model estimates a pooled mean and between-record variance tau-squared by restricted maximum "
            "likelihood (REML). Confidence intervals use the standard normal 1.959964 critical value, and the "
            "pooled-effect p value is a two-sided normal test against zero.", styles["Bodyx"]
        ),
        Paragraph(
            "Egger's diagnostic regresses standardized effect (yi / sqrt(vi)) on precision "
            "(1 / sqrt(vi)); the intercept is tested with a two-sided t distribution with k - 2 degrees of "
            "freedom. The document-registered classification rule is: rule passed when p >= 0.10, rule failed "
            "when p < 0.05, and inconclusive otherwise. This classification is not a judgment of publication "
            "bias or scientific validity.", styles["Bodyx"]
        ),
        Paragraph("Effect direction", styles["H2x"]),
        Paragraph(
            "Positive SMD means the experimentally designated expectancy group had higher measured IQ than "
            "the control group. weeks is teacher-student contact before expectancy induction. setting is group "
            "or individual testing; tester records whether the tester knew the assignment.", styles["Bodyx"]
        ),
        PageBreak(),
    ])

    rows = [["ID", "Experiment", "Author", "Year", "Weeks", "Set", "Tester", "n1", "n2", "yi", "vi"]]
    for item in dataset["studies"]:
        rows.append([
            item["id"],
            "P&H-1972" if item["id"] in ("s04", "s05") else item["id"],
            item["author"], str(item["year"]), str(item["weeks"]), item["setting"], item["tester"],
            str(item["n1i"]), str(item["n2i"]), f'{item["yi"]:.2f}', f'{item["vi"]:.4f}',
        ])
    midpoint = 11
    for table_index, chunk in enumerate((rows[:midpoint], [rows[0], *rows[midpoint:]]), start=1):
        story.append(Paragraph(f"Study-level data ({table_index}/2)", styles["H1x"]))
        story.append(Paragraph(
            "All rows are secondary-dataset transcriptions. Source locator: corresponding row in "
            "metadat::dat.raudenbush1985. Primary-source checked: no. Risk of bias: not assessed.",
            styles["Smallx"],
        ))
        table = Table(
            chunk,
            repeatRows=1,
            colWidths=[10*mm, 16*mm, 37*mm, 12*mm, 12*mm, 13*mm, 15*mm, 10*mm, 10*mm, 12*mm, 15*mm],
            hAlign="LEFT",
        )
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#563B8E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.3),
            ("LEADING", (0, 0), (-1, -1), 9),
            ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9D4C9")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F6F1")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
        story.append(Spacer(1, 5 * mm))
        if table_index == 1:
            story.append(Paragraph(
                "s04 and s05 share one experiment identifier. Excluding s04 removes only the aware-tester "
                "record; s05 remains in the requested sensitivity fit.", styles["Callout"]
            ))
            story.append(PageBreak())

    story.extend([
        Spacer(1, 4 * mm),
        KeepTogether([
            Paragraph("Provenance and limitations", styles["H1x"]),
            Paragraph(
                "Analytic values: Viechtbauer's open metadat distribution, dat.raudenbush1985. "
                "Synthesis: Raudenbush, S. W. (1984), Magnitude of teacher expectancy effects on pupil IQ "
                "as a function of the credibility of expectancy induction: A synthesis of findings from 18 "
                "experiments, Journal of Educational Psychology 76(1), 85-97, DOI "
                "10.1037/0022-0663.76.1.85.", styles["Bodyx"]
            ),
            Paragraph(
                "This baseline does not contain primary-paper page and table locators for each contributing "
                "record, verbatim primary quotations, independently reconstructed effect-size derivations, or "
                "risk-of-bias judgments. Missingness is explicit so that absence is not mistaken for a negative "
                "assessment.", styles["Bodyx"]
            ),
            Paragraph(
                "The corpus is one historical meta-analytic dataset. A score on this artifact does not establish "
                "general performance on other papers, effect measures, study designs, or scientific domains.",
                styles["Callout"]
            ),
        ]),
    ])

    doc.build(story, onFirstPage=page_chrome, onLaterPages=page_chrome, canvasmaker=InvariantCanvas)


if __name__ == "__main__":
    try:
        build_pdf(load_dataset())
    except Exception as exc:
        print(f"benchmark PDF build failed: {exc}", file=sys.stderr)
        raise
    print(OUTPUT)
