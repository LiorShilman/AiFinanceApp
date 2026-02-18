import { Injectable } from '@angular/core';
import { LaTeXAutoFixer, processAIResponse } from './latex-auto-fixer';

@Injectable({
  providedIn: 'root'
})
export class LaTeXFixerService {
  
  /**
   * 🎯 עיבוד תשובת AI עם תיקון LaTeX אוטומטי
   */
  processAIMessage(aiResponse: string): {
    content: string;
    hasLatexFixes: boolean;
    fixReport: any;
  } {
    const result = processAIResponse(aiResponse);
    
    return {
      content: result.processedText,
      hasLatexFixes: result.report.hasChanges,
      fixReport: result.report
    };
  }

  /**
   * 🔧 תיקון מהיר לטקסט
   */
  quickFix(text: string): string {
    return LaTeXAutoFixer.quickFix(text);
  }

  /**
   * 🔍 זיהוי בעיות LaTeX בטקסט
   */
  detectIssues(text: string): string[] {
    return LaTeXAutoFixer.detectIssues(text);
  }
}