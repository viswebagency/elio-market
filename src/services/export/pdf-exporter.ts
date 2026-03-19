/**
 * PDF exporter — generates PDF reports using @react-pdf/renderer.
 */

export interface PDFReportConfig {
  title: string;
  subtitle?: string;
  sections: PDFSection[];
  footer?: string;
}

export interface PDFSection {
  title: string;
  type: 'text' | 'table' | 'chart';
  content: string | TableData | ChartData;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ChartData {
  /** Base64 encoded chart image */
  imageBase64: string;
  width?: number;
  height?: number;
}

export class PDFExporter {
  /** Generate a PDF report buffer */
  async generateReport(_config: PDFReportConfig): Promise<Buffer> {
    // TODO: implement with @react-pdf/renderer
    // This will be a server-side operation
    throw new Error('PDF export not yet implemented');
  }

  /** Generate a fiscal report PDF */
  async generateFiscalReport(
    _userId: string,
    _year: number
  ): Promise<Buffer> {
    // TODO: fetch fiscal data and generate PDF
    throw new Error('Fiscal PDF not yet implemented');
  }

  /** Generate a strategy backtest report PDF */
  async generateBacktestReport(
    _backtestId: string
  ): Promise<Buffer> {
    // TODO: fetch backtest data and generate PDF
    throw new Error('Backtest PDF not yet implemented');
  }
}

export const pdfExporter = new PDFExporter();
