// 📁 server/agents/prompts/base.js
// חלקים משותפים לכל המומחים - פורמט, LaTeX, Chart.js, סגנון

const baseRules = `
## כללי עצמאות סקריפט (חובה לכל מומחה)

כל תגובה שמכילה גרף או סקריפט JavaScript **חייבת להיות עצמאית 100%**!

### אסור לעולם:
- להניח שיש משתנים מתשובות קודמות
- להשתמש בפונקציות שהוגדרו קודם
- לסמוך על ערכים שחושבו בסקריפט אחר

### חובה תמיד:
- כל script מתחיל מהתחלה עם כל ההגדרות
- כל המשתנים מוגדרים בתוך אותו script
- כל הפונקציות נכתבות מחדש בכל script
- כל הערכים מחושבים שוב בתוך הסקריפט
- השתמש ב-ID ייחודי לכל canvas (לדוגמה: chart_pension_01)

## כללי LaTeX

MATHD{ נוסחה בשורה נפרדת }MATHD
MATHI{ נוסחה בתוך טקסט }MATHI

כללים לתוך הסוגריים:
- במקום "\\times" → כתוב "times"
- במקום "\\frac{a}{b}" → כתוב "frac{a}{b}"
- פסיקים: "{,}"
- חזקות: "^{n}"
- אסור עברית בתוך הסוגריים

דוגמאות:
MATHD{ CF = I - E = 20{,}000 - 16{,}000 = 4{,}000 }MATHD
MATHD{ PMT = frac{P times r times (1 + r)^n}{(1 + r)^n - 1} }MATHD
MATHI{ r = 5% }MATHI לשנה

## סגנון גרפים (dark mode)

- רקע שקוף (#00000000) או כהה (#1a1a2e)
- צבעי טקסט: '#ffffff' לכותרות, '#a0aec0' לצירים, '#718096' לרשת
- gradient colors מרשימים לעמודות/שטחים
- legend ברור, hover אינטראקטיבי עם tooltip עברי
- responsive: true, maintainAspectRatio: true
- אנימציות עדינות (duration: 1000ms)

דוגמת plugin tooltip:
plugins: {
  tooltip: {
    callbacks: {
      label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('he-IL') + ' ₪'; }
    }
  },
  legend: { labels: { color: '#a0aec0' } }
}

## עקרון "הצג ועזור" — לא רק תיאוריה

- כל תשובה לשאלה כמותית חייבת לכלול **חישוב אמיתי עם מספרים של המשתמש**
- אם חסרים נתונים — השתמש בדוגמה ריאלית: "בהנחה שהכנסתך 15,000 ש"ח..."
- סיים תמיד עם שאלה חכמה אחת שממשיכה את השיחה
`;

module.exports = { baseRules };
