import { readFile } from 'fs/promises';
import { join } from 'path';

export interface ReportData {
  organizationName: string;
  overallReadiness: number;
  cl4_status: string;
  cl5_status: string;
  cl6_status: string;
  gapNotes: string;
}

export class ReadinessReportService {
  static async generateReport(data: ReportData): Promise<string> {
    const templatePath = join(process.cwd(), 'src', 'templates', 'reports', 'certification-readiness-report.md');
    let content = await readFile(templatePath, 'utf-8');

    content = content
      .replace(/\[Organization Name\]/g, data.organizationName)
      .replace(/{{overall_readiness}}/g, data.overallReadiness.toString())
      .replace(/{{cl4_status}}/g, data.cl4_status)
      .replace(/{{cl5_status}}/g, data.cl5_status)
      .replace(/{{cl6_status}}/g, data.cl6_status)
      .replace(/{{gap_analysis_notes}}/g, data.gapNotes)
      .replace(/{{date_modified}}/g, new Date().toLocaleDateString())
      .replace(/{{readiness_level}}/g, data.overallReadiness > 80 ? 'Optimized' : 'In Development');

    return content;
  }
}
