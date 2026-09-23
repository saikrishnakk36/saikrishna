"""Builds the Avecas Technologies Sdn. Bhd. Letter of Authorization (DOCX; PDF via LibreOffice)."""
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

NAVY = RGBColor(0x0B, 0x2A, 0x4A)
TEAL = RGBColor(0x00, 0x8C, 0x9E)
GREY = RGBColor(0x55, 0x5F, 0x6B)
FONT = "Liberation Sans"

COMPANY = "AVECAS TECHNOLOGIES SDN. BHD."
REG_NO = "Registration No. 202601025108"
ADDRESS = "[Registered Address], Penang, Malaysia"
CONTACT = "www.avecas.com  |  [email]  |  [phone]"
DATE = "23 September 2026"
REF = "AVC-MY/AUTH/2026/001"
PERSON = "Mr. Sai Krishna Kairamkonda"


def border(par, side="bottom", color="008C9E", size=12):
    pPr = par._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    el = OxmlElement(f"w:{side}")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(size))
    el.set(qn("w:space"), "4")
    el.set(qn("w:color"), color)
    bdr.append(el)
    pPr.append(bdr)


def run(par, text, size=10.5, bold=False, color=None, italic=False):
    r = par.add_run(text)
    r.font.name = FONT
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    if color:
        r.font.color.rgb = color
    return r


def para(doc, text="", size=10.5, bold=False, align=None, after=6, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(0)
    if align:
        p.alignment = align
    if text:
        run(p, text, size, bold, color)
    return p


doc = Document()
sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
sec.left_margin = sec.right_margin = Cm(2.2)
sec.top_margin, sec.bottom_margin = Cm(1.4), Cm(1.6)
sec.header_distance, sec.footer_distance = Cm(0.9), Cm(0.8)
doc.styles["Normal"].font.name = FONT
doc.styles["Normal"].font.size = Pt(10.5)

# Letterhead
h = sec.header
hp = h.paragraphs[0]
hp.paragraph_format.space_after = Pt(0)
run(hp, "AVECAS", 22, True, NAVY)
run(hp, "  TECHNOLOGIES SDN. BHD.", 13, True, TEAL)
hp2 = h.add_paragraph()
hp2.paragraph_format.space_after = Pt(0)
run(hp2, f"({REG_NO})", 8.5, color=GREY)
hp3 = h.add_paragraph()
run(hp3, "VLSI  •  Semiconductor Design Services  •  Embedded Engineering", 8.5, color=GREY, italic=True)
border(hp3)

f = sec.footer
fp = f.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
border(fp, side="top", size=6)
run(fp, f"{COMPANY} ({REG_NO.split()[-1]})  |  {ADDRESS}\n", 8, color=GREY)
run(fp, CONTACT + "  |  India  •  Malaysia  •  United Kingdom  •  USA", 8, color=GREY)

# Body
p = para(doc, after=2)
run(p, "Ref: ", bold=True)
run(p, REF)
p = para(doc, after=14)
run(p, "Date: ", bold=True)
run(p, DATE)

para(doc, "TO WHOM IT MAY CONCERN", 11, True, after=12)

p = para(doc, after=12, align=WD_ALIGN_PARAGRAPH.CENTER)
run(p, "LETTER OF AUTHORIZATION", 13, True, NAVY).underline = True

p = para(doc, after=8, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
run(p, f"{COMPANY} ")
run(p, "(“the Company”)", italic=True)
run(p, f", a private limited company incorporated in Malaysia under the Companies Act 2016 "
       f"with {REG_NO} and having its office at {ADDRESS}, hereby authorizes:")

t = doc.add_table(rows=4, cols=2)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
t.style = "Table Grid"
rows = [
    ("Name", PERSON.replace("Mr. ", "").upper()),
    ("Designation", "Director"),
    ("Nationality", "Indian"),
    ("Passport No.", "[__________]"),
]
for i, (k, v) in enumerate(rows):
    for j, txt in enumerate((k, v)):
        c = t.cell(i, j)
        c.width = Cm(5) if j == 0 else Cm(11)
        cp = c.paragraphs[0]
        cp.paragraph_format.space_after = Pt(2)
        run(cp, txt, 10.5, bold=(j == 0 or i == 0), color=NAVY if j == 0 else None)
para(doc, after=6)

p = para(doc, after=6, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
run(p, "to act as the Authorized Representative and Authorized Signatory of the Company, and on its behalf to:")

scope = [
    "Represent the Company before government ministries, statutory bodies and agencies in Malaysia, "
    "including SSM, LHDN (IRB), MDEC, MIDA, InvestPenang, Penang Development Corporation (PDC), "
    "KWSP/EPF, PERKESO/SOCSO and the Immigration Department.",
    "Open, operate and maintain bank accounts of the Company, and sign cheques, instructions, "
    "account-opening forms and related banking documents.",
    "Negotiate, sign and execute contracts, agreements, NDAs, purchase orders, quotations, "
    "vendor-registration and empanelment applications with customers, partners and suppliers.",
    "Sign and submit applications, declarations, forms and correspondence, and collect documents, "
    "licences and approvals issued in the name of the Company.",
    "Execute tenancy/lease agreements and deal with landlords, utilities and service providers.",
    "Do all such other lawful acts and things as may be necessary or incidental to the above.",
]
for i, s in enumerate(scope, 1):
    p = para(doc, after=4, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
    p.paragraph_format.left_indent = Cm(0.9)
    p.paragraph_format.first_line_indent = Cm(-0.6)
    run(p, f"{i}.  ")
    run(p, s)

p = para(doc, after=8, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
p.paragraph_format.space_before = Pt(6)
run(p, "All acts, deeds and documents lawfully done or signed by the Authorized Representative within the "
       "scope of this authorization shall be binding on the Company. This authorization is effective from "
       f"{DATE} and shall remain valid until revoked by the Company in writing.")

p = para(doc, after=14, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
run(p, "Specimen signature of the Authorized Representative is given below for verification.")

# Signature blocks side by side
sig = doc.add_table(rows=1, cols=2)
sig.alignment = WD_TABLE_ALIGNMENT.CENTER
left, right = sig.cell(0, 0), sig.cell(0, 1)
lp = left.paragraphs[0]
run(lp, f"For and on behalf of\n{COMPANY}\n\n\n\n", 10, True)
run(lp, "______________________________\n")
run(lp, "Name: [Director / Company Secretary]\nDesignation: [________]\nDate: ____________\n\n", 10)
run(lp, "[Company Common Seal / Stamp]", 9, color=GREY, italic=True)
rp = right.paragraphs[0]
run(rp, "Specimen Signature of\nAuthorized Representative\n\n\n\n", 10, True)
run(rp, "______________________________\n")
run(rp, f"{PERSON.replace('Mr. ', '')}\nDirector\nDate: ____________", 10)

doc.save("Avecas_MY_Letter_of_Authorization_Sai_Krishna_Kairamkonda.docx")
