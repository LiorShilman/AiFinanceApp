/**
 * 🔧 מתקן אוטומטי לנוסחאות LaTeX מורכבות
 * מתקן בעיות נפוצות בנוסחאות LaTeX שמגיעות מ-AI
 */

export class LaTeXAutoFixer {
  
  /**
   * 🎯 מתקן טקסט מלא עם נוסחאות LaTeX
   */
  static fixLaTeXInText(text: string): string {
    // תיקון נוסחאות בין \[ ו-\]
    text = text.replace(/\\\[(.*?)\\\]/gs, (match, formula) => {
      const fixedFormula = this.fixLaTeXFormula(formula);
      return `\\[${fixedFormula}\\]`;
    });
    
    // תיקון נוסחאות בין $$ ו-$$
    text = text.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
      const fixedFormula = this.fixLaTeXFormula(formula);
      return `$$${fixedFormula}$$`;
    });
    
    // תיקון נוסחאות inline בין $ ו-$
    text = text.replace(/\$([^$\n]+)\$/g, (match, formula) => {
      const fixedFormula = this.fixLaTeXFormula(formula);
      return `$${fixedFormula}$`;
    });
    
    return text;
  }

  /**
   * 🔧 מתקן נוסחה בודדת
   */
  private static fixLaTeXFormula(formula: string): string {
    let fixed = formula;
    
    // שלב 1: תיקון סוגריים מסולסלים מורכבים
    fixed = this.fixNestedBraces(fixed);
    
    // שלב 2: תיקון קווים תחתונים מורכבים
    fixed = this.fixComplexSubscripts(fixed);
    
    // שלב 3: תיקון escape characters מיותרים
    fixed = this.fixUnnecessaryEscapes(fixed);
    
    // שלב 4: תיקון רווחים וסימני פיסוק
    fixed = this.fixSpacingAndPunctuation(fixed);
    
    // שלב 5: תיקון מספרים עם פסיקים
    fixed = this.fixNumberFormatting(fixed);
    
    // שלב 6: תיקון שמות משתנים ארוכים
    fixed = this.fixLongVariableNames(fixed);
    
    return fixed.trim();
  }

  /**
   * 🔨 תיקון סוגריים מסולסלים מורכבים
   */
  private static fixNestedBraces(formula: string): string {
    // תבניות נפוצות של בעיות סוגריים
    const patterns = [
      // FV_{monthly_{initial}} -> FV_{\text{monthly initial}}
      {
        pattern: /([A-Za-z]+)_{([a-zA-Z]+)_{([a-zA-Z]+)}}/g,
        replacement: (match: string, base: string, sub1: string, sub2: string) => {
          return `${base}_{\\text{${sub1} ${sub2}}}`;
        }
      },
      
      // PMT_{year_{start}} -> PMT_{\text{year start}}
      {
        pattern: /([A-Za-z]+)_{([a-zA-Z]+)_{([a-zA-Z]+)}_{([a-zA-Z]+)}}/g,
        replacement: (match: string, base: string, sub1: string, sub2: string, sub3: string) => {
          return `${base}_{\\text{${sub1} ${sub2} ${sub3}}}`;
        }
      }
    ];

    let result = formula;
    patterns.forEach(({ pattern, replacement }) => {
      result = result.replace(pattern, replacement);
    });

    return result;
  }

  /**
   * 🔧 תיקון קווים תחתונים מורכבים
   */
  private static fixComplexSubscripts(formula: string): string {
    // תיקון backslash עם underscore
    formula = formula.replace(/\\\_/g, ' ');
    
    // תיקון underscores כפולים
    formula = formula.replace(/__+/g, '_');
    
    // תיקון תבניות נפוצות
    const commonFixes = [
      { from: /monthly\\_initial/g, to: 'monthly initial' },
      { from: /annual\\_initial/g, to: 'annual initial' },
      { from: /year\\_end/g, to: 'year end' },
      { from: /month\\_start/g, to: 'month start' },
      { from: /total\\_value/g, to: 'total value' },
      { from: /final\\_amount/g, to: 'final amount' }
    ];

    commonFixes.forEach(({ from, to }) => {
      formula = formula.replace(from, to);
    });

    return formula;
  }

  /**
   * 🧹 תיקון escape characters מיותרים
   */
  private static fixUnnecessaryEscapes(formula: string): string {
    // הסרת backslashes מיותרים
    const unnecessaryEscapes = [
      /\\([a-zA-Z])/g, // \a -> a (כשזה לא פקודה LaTeX)
      /\\\s/g, // \ + רווח
      /\\(?=[0-9])/g // \ לפני מספרים
    ];

    let result = formula;
    unnecessaryEscapes.forEach(pattern => {
      result = result.replace(pattern, '$1');
    });

    return result;
  }

  /**
   * 📝 תיקון רווחים וסימני פיסוק
   */
  private static fixSpacingAndPunctuation(formula: string): string {
    // תיקון רווחים מיותרים
    formula = formula.replace(/\s+/g, ' ');
    
    // תיקון סימני כפל
    formula = formula.replace(/\*\s*/g, ' \\times ');
    formula = formula.replace(/×\s*/g, ' \\times ');
    
    // תיקון סימני חלוקה
    formula = formula.replace(/\/\s*/g, ' \\div ');
    formula = formula.replace(/÷\s*/g, ' \\div ');
    
    // תיקון סימני קירוב
    formula = formula.replace(/~=\s*/g, ' \\approx ');
    formula = formula.replace(/≈\s*/g, ' \\approx ');
    
    return formula;
  }

  /**
   * 🔢 תיקון עיצוב מספרים
   */
  private static fixNumberFormatting(formula: string): string {
    // תיקון מספרים עם פסיקים: 10,000 -> 10{,}000
    formula = formula.replace(/(\d+),(\d{3})/g, '$1{,}$2');
    
    // תיקון מספרים עברים עם רווחים: 10 000 -> 10{,}000
    formula = formula.replace(/(\d+)\s+(\d{3})/g, '$1{,}$2');
    
    // תיקון אחוזים
    formula = formula.replace(/(\d+)%/g, '$1\\%');
    
    return formula;
  }

  /**
   * 📏 תיקון שמות משתנים ארוכים
   */
  private static fixLongVariableNames(formula: string): string {
    const longNameMappings = {
      // משתנים פיננסיים נפוצים
      'future_value': 'FV',
      'present_value': 'PV',
      'payment': 'PMT',
      'interest_rate': 'r',
      'number_of_periods': 'n',
      'initial_amount': 'P_0',
      'final_amount': 'P_f',
      'monthly_payment': 'PMT_m',
      'annual_payment': 'PMT_a',
      
      // תבניות נפוצות
      'monthly initial': 'm,i',
      'annual initial': 'a,i',
      'year end': 'ye',
      'month start': 'ms',
      'total value': 'TV',
      'net present value': 'NPV',
      'internal rate of return': 'IRR'
    };

    Object.entries(longNameMappings).forEach(([long, short]) => {
      const pattern = new RegExp(`\\{\\\\text\\{${long}\\}\\}`, 'gi');
      formula = formula.replace(pattern, `{${short}}`);
    });

    return formula;
  }

  /**
   * 🎯 פונקציה מקצרה לשימוש מהיר
   */
  static quickFix(text: string): string {
    return this.fixLaTeXInText(text);
  }

  /**
   * 🔍 זיהוי בעיות פוטנציאליות
   */
  static detectIssues(formula: string): string[] {
    const issues: string[] = [];
    
    // זיהוי סוגריים מורכבים
    if (formula.match(/_{[^}]*_{[^}]*}/)) {
      issues.push('סוגריים מסולסלים מורכבים');
    }
    
    // זיהוי escape characters מיותרים
    if (formula.match(/\\[a-zA-Z](?![a-zA-Z])/)) {
      issues.push('Escape characters מיותרים');
    }
    
    // זיהוי underscores מורכבים
    if (formula.match(/\\_/)) {
      issues.push('Underscores לא תקינים');
    }
    
    // זיהוי שמות משתנים ארוכים
    if (formula.match(/_{[^}]{15,}}/)) {
      issues.push('שמות משתנים ארוכים מדי');
    }
    
    return issues;
  }

  /**
   * 📊 דוח על תיקונים שבוצעו
   */
  static getFixReport(original: string, fixed: string): {
    hasChanges: boolean;
    changes: string[];
    issuesFound: string[];
    fixedFormulas: number;
  } {
    const issuesFound = this.detectIssues(original);
    const hasChanges = original !== fixed;
    const changes: string[] = [];
    
    if (hasChanges) {
      if (original.match(/_{[^}]*_{[^}]*}/) && !fixed.match(/_{[^}]*_{[^}]*}/)) {
        changes.push('תוקנו סוגריים מורכבים');
      }
      if (original.match(/\\_/) && !fixed.match(/\\\_/)) {
        changes.push('תוקנו underscores');
      }
      if (original.match(/(\d+),(\d{3})/) && fixed.match(/(\d+)\{,\}(\d{3})/)) {
        changes.push('תוקן עיצוב מספרים');
      }
    }
    
    const fixedFormulas = (fixed.match(/\\\[.*?\\\]/g) || []).length + 
                         (fixed.match(/\$\$.*?\$\$/g) || []).length +
                         (fixed.match(/\$[^$\n]+\$/g) || []).length;
    
    return {
      hasChanges,
      changes,
      issuesFound,
      fixedFormulas
    };
  }
}

/**
 * 🚀 פונקציות עזר לאינטגרציה עם המערכת
 */

/**
 * פונקציה להטמעה בקומפוננט Angular
 */
export function processAIResponse(aiResponse: string): {
  processedText: string;
  report: any;
} {
  const originalText = aiResponse;
  const processedText = LaTeXAutoFixer.fixLaTeXInText(aiResponse);
  const report = LaTeXAutoFixer.getFixReport(originalText, processedText);
  
  return {
    processedText,
    report
  };
}

/**
 * פונקציה לעיבוד בזמן אמת
 */
export function processLaTeXInRealTime(text: string): string {
  return LaTeXAutoFixer.quickFix(text);
}

/**
 * 🧪 דוגמאות לבדיקה
 */
export const TEST_CASES = {
  // בעיות נפוצות שהמתקן פותר
  problematic: [
    'FV_{monthly_{initial}} = 10{,}000\\times (1 + r) + FV_{monthly}',
    'PMT_{year\\_start} = 1000 * (1 + r)',
    'NPV = \\sum_{t=0}^{n} \\frac{CF_{t}}{(1+r)^{t}}',
    'PV_{annuity\\_due} = PMT \\times \\frac{1-(1+r)^{-n}}{r} \\times (1+r)'
  ],
  
  // תוצאות מתוקנות צפויות
  expected: [
    'FV_{\\text{monthly initial}} = 10{,}000 \\times (1 + r) + FV_{\\text{monthly}}',
    'PMT_{\\text{year start}} = 1000 \\times (1 + r)',
    'NPV = \\sum_{t=0}^{n} \\frac{CF_t}{(1+r)^t}',
    'PV_{\\text{annuity due}} = PMT \\times \\frac{1-(1+r)^{-n}}{r} \\times (1+r)'
  ]
};

