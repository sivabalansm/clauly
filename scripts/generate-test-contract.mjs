import { Document, Packer, Paragraph, HeadingLevel, AlignmentType } from "docx"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const outPath = path.join(repoRoot, "test-fixtures", "test-contract.docx")

const HEADING = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 }
  })

const SUBHEADING = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 }
  })

const BODY = (text) =>
  new Paragraph({
    text,
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED
  })

const doc = new Document({
  creator: "Clauly Test Harness",
  title: "Test Master Services Agreement",
  description: "Sample MSA used to verify the Clauly + Redliner pipeline.",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          text: "MASTER SERVICES AGREEMENT",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 }
        }),
        BODY(
          "This Master Services Agreement (\"Agreement\") is entered into as of the date last signed below (\"Effective Date\") by and between Acme Vendor, Inc. (\"Vendor\") and Globex Customer Co. (\"Customer\")."
        ),

        HEADING("1. Limitation of Liability"),
        BODY(
          "In no event shall total liability exceed $100."
        ),
        BODY(
          "The foregoing limitation shall apply regardless of the form of action, whether in contract, tort, strict liability, or otherwise."
        ),

        HEADING("2. Indemnification"),
        BODY(
          "The Vendor shall indemnify the Customer for \"any\" third-party claim."
        ),
        BODY(
          "Customer shall promptly notify Vendor of any such claim and grant Vendor sole control of the defense thereof."
        ),

        HEADING("3. Representations and Warranties"),
        BODY(
          "Vendor represents and warrants that the services will perform in all material respects."
        ),

        HEADING("4. Intellectual Property"),
        BODY(
          "All intellectual property rights in deliverables shall belong to Vendor, with a non-exclusive license granted to Customer."
        ),

        HEADING("5. Governing Law"),
        BODY(
          "This Agreement shall be governed by the laws of Delaware."
        ),

        HEADING("6. Notices"),
        BODY(
          "All notices shall be in writing and delivered by hand, certified mail, or reputable overnight courier."
        ),

        HEADING("7. Severability"),
        BODY(
          "If any provision is invalid, the remainder shall remain in force."
        ),

        HEADING("8. Term and Termination"),
        BODY(
          "This Agreement shall commence on the Effective Date and continue for an initial term of one (1) year, automatically renewing for successive one-year terms unless either party provides thirty (30) days' written notice of non-renewal."
        ),

        SUBHEADING("Signatures"),
        BODY("Vendor: _______________________________   Date: ____________"),
        BODY("Customer: _____________________________   Date: ____________")
      ]
    }
  ]
})

const buffer = await Packer.toBuffer(doc)
await fs.mkdir(path.dirname(outPath), { recursive: true })
await fs.writeFile(outPath, buffer)
console.log(`Wrote ${outPath} (${buffer.length} bytes)`)
