import fs from "node:fs/promises"
import path from "node:path"

export interface ContractRecord {
  filename: string
  text: string
  charCount: number
  loadedAt: number
  glossary: string[]
}

export class ContractStore {
  private current: ContractRecord | null = null

  public async loadFromText(text: string, filename = "Pasted contract"): Promise<ContractRecord> {
    const cleaned = text.trim()
    if (!cleaned) throw new Error("Contract text is empty.")
    this.current = {
      filename,
      text: cleaned,
      charCount: cleaned.length,
      loadedAt: Date.now(),
      glossary: this.buildGlossary(cleaned)
    }
    return this.current
  }

  public async loadFromFile(filePath: string): Promise<ContractRecord> {
    const ext = path.extname(filePath).toLowerCase()
    const buffer = await fs.readFile(filePath)
    const filename = path.basename(filePath)
    return this.loadFromBuffer(buffer, filename, ext)
  }

  public async loadFromBuffer(buffer: Buffer, filename: string, hintExt?: string): Promise<ContractRecord> {
    const ext = (hintExt || path.extname(filename)).toLowerCase()
    let text: string
    if (ext === ".pdf") {
      text = await this.extractPdf(buffer)
    } else if (ext === ".docx") {
      text = await this.extractDocx(buffer)
    } else if (ext === ".doc") {
      throw new Error("Legacy .doc format unsupported — please convert to .docx or PDF.")
    } else {
      text = buffer.toString("utf8")
    }
    return this.loadFromText(text, filename)
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(buffer)
    return result.text
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    const mammoth = require("mammoth") as { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> }
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  private buildGlossary(text: string): string[] {
    const found = new Set<string>()
    const properNouns = text.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3}\b/g) || []
    for (const phrase of properNouns) {
      if (phrase.length > 4 && phrase.length < 60) found.add(phrase)
    }
    const dollarAmounts = text.match(/\$[\d,]+(?:\.\d+)?(?:\s*(?:million|thousand|M|K))?/gi) || []
    for (const amount of dollarAmounts) found.add(amount)
    const legalTerms = [
      "indemnification", "indemnify", "warranty", "liability", "termination",
      "breach", "confidentiality", "non-disclosure", "intellectual property",
      "force majeure", "governing law", "jurisdiction", "arbitration",
      "assignment", "severability", "amendment", "consideration", "remedy",
      "damages", "default", "covenant", "representation", "warranty"
    ]
    for (const term of legalTerms) {
      if (new RegExp(`\\b${term}\\b`, "i").test(text)) found.add(term)
    }
    return Array.from(found).slice(0, 100)
  }

  public get(): ContractRecord | null {
    return this.current
  }

  public clear(): void {
    this.current = null
  }
}
