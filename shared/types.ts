// FROZEN CONTRACT between /pipeline (Role A) and /web (Role B).
// Changes require both teammates to agree.
// Rule: all unit conversion happens in the pipeline, never in the UI.

export type Phase = 'solid' | 'liquid' | 'gas';
export type Grade = 'measured' | 'bounded' | 'no-data';
export type Outcome = 'extinction' | 'sustained' | 'disruption' | 'unknown';

export interface TestRow {
  id: string;                    // "PSI-69-012"
  accession: string;             // "PSI-69"
  fuel: string;                  // "Methanol"
  phase: Phase;
  family: string;                // "droplet" | "flame-spread" | "burner"
  o2Fraction: number | null;     // ALWAYS mole fraction 0-1, converted upstream
  pressureAtm: number | null;    // ALWAYS atm
  flowCmS: number | null;
  diluent: string | null;        // "N2" | "CO2" | "He"
  sampleSizeMm: number | null;
  burningRate: number | null;
  outcome: Outcome;              // 'unknown' for most — this is expected
  raw: Record<string, string>;   // original row, for provenance panel
  sourceFile: string;
  sourceO2Column: string;        // original column name, for provenance
  confidence: 'high' | 'medium' | 'low';
}

export interface Investigation {
  accession: string;
  acronym: string;
  title: string;
  doi: string;
  platform: string;              // "ISS"
  hardware: string;              // "CIR / MDCA"
  family: string;
  objective: string;             // verbatim from PSI
  summary: string;               // LLM, 2 sentences, plain English
  tags: ('prevention' | 'detection' | 'suppression')[];
  testCount: number;
  o2Range: [number, number] | null;
  hasOutcomeData: boolean;
  publications: { title: string; doi: string }[];
}

export interface EvidenceResult {
  grade: Grade;
  matches: TestRow[];
  nearest: TestRow[];            // populated when grade is 'no-data'
  caveat: string | null;         // why nearest may not transfer
}
