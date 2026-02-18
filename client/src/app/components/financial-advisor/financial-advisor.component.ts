import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { FormsModule } from '@angular/forms';

// ממשקי נתונים משופרים
export interface FinancialResponse {
  response_type: 'advanced_analysis' | 'basic_financial' | 'need_more_data' | 'non_financial' | 'error';
  [key: string]: any;
}

export interface AdvancedAnalysisResponse extends FinancialResponse {
  response_type: 'advanced_analysis';
  metadata: {
    analysis_date: string;
    complexity_level: 'בסיסי' | 'בינוני' | 'גבוה';
    urgency: 'נמוכה' | 'בינונית' | 'גבוהה';
    estimated_time: string;
  };
  executive_summary: {
    key_findings: string[];
    bottom_line: string;
    action_priority: string;
  };
  detailed_analysis: {
    situation: string;
    opportunities: string;
    risks: string;
    recommendations: string[];
  };
  calculations: Array<{
    title: string;
    formula: string;
    variables: { [key: string]: number | string };
    result: number | string;
    unit: string;
    explanation: string;
  }>;
  visualizations: Array<{
    type: 'line' | 'bar' | 'pie' | 'doughnut';
    title: string;
    data: {
      labels: string[];
      datasets: Array<{
        label: string;
        data: number[];
        backgroundColor?: string[];
        borderColor?: string;
      }>;
    };
    insights: string[];
  }>;
  tables: Array<{
    title: string;
    headers: string[];
    rows: Array<{ [key: string]: string | number }>;
    highlights?: number[]; // אינדקסים של שורות מיוחדות
  }>;
  action_plan: {
    immediate: Array<{ action: string; deadline: string; priority: 'גבוה' | 'בינוני' | 'נמוך' }>;
    short_term: Array<{ action: string; timeframe: string; expected_outcome: string }>;
    long_term: Array<{ action: string; timeframe: string; expected_outcome: string }>;
  };
  thinking_question: {
    question: string;
    context: string;
  };
}

export interface BasicFinancialResponse extends FinancialResponse {
  response_type: 'basic_financial';
  question: string;
  core_answer: {
    definition: string;
    explanation: string;
    israeli_context: string;
    practical_tips: string[];
  };
  examples: Array<{
    scenario: string;
    calculation?: string;
    result: string;
  }>;
  related_topics: string[];
  follow_up_questions: string[];
}

export interface NeedMoreDataResponse extends FinancialResponse {
  response_type: 'need_more_data';
  message: string;
  required_info: Array<{
    category: string;
    specific_need: string;
    why_needed: string;
    input_type: 'מספר' | 'טקסט' | 'תאריך' | 'בחירה';
  }>;
  quick_tips: string[];
  examples: string[];
}

export interface NonFinancialResponse extends FinancialResponse {
  response_type: 'non_financial';
  message: string;
  suggestion: string;
  financial_examples: string[];
}

@Component({
  selector: 'app-financial-advisor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="financial-advisor-container" [ngClass]="'response-' + response?.response_type">
      
      <!-- Advanced Analysis Response -->
      <div *ngIf="response?.response_type === 'advanced_analysis'" class="advanced-analysis">
        <div class="advanced-container">
          
          <!-- כותרת ומטאדטה -->
          <div class="analysis-header">
            <h1>📊 ניתוח פיננסי מתקדם</h1>
            <div class="metadata-grid">
              <div class="metadata-item">
                <span class="label">תאריך הניתוח</span>
                <span class="value">{{ getAdvancedResponse().metadata.analysis_date }}</span>
              </div>
              <div class="metadata-item">
                <span class="label">רמת מורכבות</span>
                <span class="value">{{ getAdvancedResponse().metadata.complexity_level }}</span>
              </div>
              <div class="metadata-item">
                <span class="label">דחיפות</span>
                <span class="value urgency" [ngClass]="'urgency-' + getAdvancedResponse().metadata.urgency">
                  {{ getAdvancedResponse().metadata.urgency }}
                </span>
              </div>
              <div class="metadata-item">
                <span class="label">זמן הערכה</span>
                <span class="value">{{ getAdvancedResponse().metadata.estimated_time }}</span>
              </div>
            </div>
          </div>

          <!-- סיכום מנהלים -->
          <div class="executive-summary">
            <h2>⚡ סיכום מנהלים</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <h3>🔍 ממצאים עיקריים</h3>
                <ul>
                  <li *ngFor="let finding of getAdvancedResponse().executive_summary.key_findings">
                    {{ finding }}
                  </li>
                </ul>
              </div>
              <div class="summary-item highlight">
                <h3>🎯 המסקנה העיקרית</h3>
                <p>{{ getAdvancedResponse().executive_summary.bottom_line }}</p>
              </div>
              <div class="summary-item">
                <h3>🚀 עדיפות פעולה</h3>
                <p>{{ getAdvancedResponse().executive_summary.action_priority }}</p>
              </div>
            </div>
          </div>

          <!-- חלק החישובים והתוכן -->
          <div class="calculations-section">
            <h2>💹 ניתוח ותוצאות</h2>
            
            <div class="calculations-grid">
              
              <!-- חישובים פיננסיים -->
              <div class="calculation-card" *ngFor="let calc of getAdvancedResponse().calculations">
                <h3>{{ calc.title }}</h3>
                <div class="formula-container">
                  <div class="formula">
                    <span [innerHTML]="formatFormula(calc.formula, calc.variables)"></span>
                  </div>
                  <div class="result">
                    <span class="result-value">{{ calc.result }}</span>
                    <span class="result-label">{{ calc.unit }}</span>
                  </div>
                  <p class="description">{{ calc.explanation }}</p>
                </div>
              </div>

              <!-- גרפים -->
              <div class="charts-section" *ngIf="getAdvancedResponse().visualizations?.length">
                <h2>📈 ויזואליזציה</h2>
                <div class="charts-grid">
                  <div class="chart-container" *ngFor="let viz of getAdvancedResponse().visualizations; let i = index">
                    <h3>{{ viz.title }}</h3>
                    <canvas #chartCanvas [id]="'chart-' + i"></canvas>
                    <div class="chart-insights">
                      <h4>💡 תובנות:</h4>
                      <ul>
                        <li *ngFor="let insight of viz.insights">{{ insight }}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <!-- טבלאות -->
              <div class="tables-section" *ngIf="getAdvancedResponse().tables?.length">
                <h2>📋 טבלאות נתונים</h2>
                <div class="tables-container">
                  <div class="table-wrapper" *ngFor="let table of getAdvancedResponse().tables">
                    <h3>{{ table.title }}</h3>
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th *ngFor="let header of table.headers">{{ header }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let row of table.rows; let i = index" 
                            [ngClass]="{ 'highlight': table.highlights?.includes(i) }">
                          <td *ngFor="let header of table.headers">
                            {{ row[header] }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- המלצות לפעולה -->
              <div class="recommendations-section">
                <h2>🎯 תוכנית פעולה</h2>
                <div class="recommendations-grid">
                  
                  <!-- פעולות מיידיות -->
                  <div class="recommendation-card immediate">
                    <h3>🔥 פעולות מיידיות</h3>
                    <ul>
                      <li *ngFor="let action of getAdvancedResponse().action_plan.immediate">
                        <strong>{{ action.action }}</strong>
                        <p>מועד יעד: {{ action.deadline }}</p>
                        <span class="deadline">עדיפות: {{ action.priority }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- טווח קצר -->
                  <div class="recommendation-card short-term">
                    <h3>📅 טווח קצר</h3>
                    <ul>
                      <li *ngFor="let action of getAdvancedResponse().action_plan.short_term">
                        <strong>{{ action.action }}</strong>
                        <p>זמן ביצוע: {{ action.timeframe }}</p>
                        <p>תוצאה צפויה: {{ action.expected_outcome }}</p>
                      </li>
                    </ul>
                  </div>

                  <!-- טווח ארוך -->
                  <div class="recommendation-card medium-term">
                    <h3>🎯 טווח ארוך</h3>
                    <ul>
                      <li *ngFor="let action of getAdvancedResponse().action_plan.long_term">
                        <strong>{{ action.action }}</strong>
                        <p>זמן ביצוע: {{ action.timeframe }}</p>
                        <p>תוצאה צפויה: {{ action.expected_outcome }}</p>
                      </li>
                    </ul>
                  </div>

                </div>
              </div>

              <!-- שאלה למחשבה -->
              <div class="thinking-question">
                <h2>🤔 שאלה למחשבה</h2>
                <div class="question-card">
                  <p class="question">{{ getAdvancedResponse().thinking_question.question }}</p>
                  <p class="context">{{ getAdvancedResponse().thinking_question.context }}</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      <!-- Basic Financial Response -->
      <div *ngIf="response?.response_type === 'basic_financial'" class="basic-financial">
        <div class="basic-container">
          
          <div class="basic-header">
            <h1>💡 מדריך פיננסי</h1>
            <p class="question">{{ getBasicResponse().question }}</p>
          </div>

          <div class="answer-section">
            <div class="answer-card">
              <h2>📖 הסבר בסיסי</h2>
              <p>{{ getBasicResponse().core_answer.definition }}</p>
            </div>

            <div class="answer-card">
              <h2>⚙️ איך זה עובד?</h2>
              <p>{{ getBasicResponse().core_answer.explanation }}</p>
            </div>

            <div class="answer-card israeli">
              <h2>🇮🇱 בהקשר הישראלי</h2>
              <p>{{ getBasicResponse().core_answer.israeli_context }}</p>
            </div>

            <div class="answer-card example" *ngIf="getBasicResponse().examples?.length">
              <h2>💼 דוגמאות מעשיות</h2>
              <div *ngFor="let example of getBasicResponse().examples" class="example-item">
                <h4>{{ example.scenario }}</h4>
                <div *ngIf="example.calculation" class="calculation">{{ example.calculation }}</div>
                <p><strong>תוצאה:</strong> {{ example.result }}</p>
              </div>
            </div>

            <div class="answer-card tip">
              <h2>💡 טיפים מעשיים</h2>
              <ul>
                <li *ngFor="let tip of getBasicResponse().core_answer.practical_tips">{{ tip }}</li>
              </ul>
            </div>
          </div>

          <div class="related-topics">
            <h3>📚 נושאים קשורים</h3>
            <div class="topics-grid">
              <span class="topic-tag" *ngFor="let topic of getBasicResponse().related_topics">
                {{ topic }}
              </span>
            </div>
          </div>

          <div class="follow-up-questions">
            <h3>❓ שאלות המשך</h3>
            <ul>
              <li *ngFor="let question of getBasicResponse().follow_up_questions">{{ question }}</li>
            </ul>
          </div>

        </div>
      </div>

      <!-- Need More Data Response -->
      <div *ngIf="response?.response_type === 'need_more_data'" class="need-more-data">
        <div class="need-data-container">
          
          <div class="need-data-header">
            <h1>🔍 נדרשים פרטים נוספים</h1>
            <p>{{ getNeedDataResponse().message }}</p>
          </div>

          <div class="required-info-section">
            <h2>📋 מידע נדרש</h2>
            <div class="info-grid">
              <div class="info-card" *ngFor="let info of getNeedDataResponse().required_info">
                <h3>{{ info.category }}</h3>
                <p class="specific-need">{{ info.specific_need }}</p>
                <p class="why-needed">{{ info.why_needed }}</p>
                <span class="input-type">סוג קלט: {{ info.input_type }}</span>
              </div>
            </div>
          </div>

          <div class="quick-tips-section">
            <h2>💡 טיפים מהירים</h2>
            <ul class="tips-list">
              <li *ngFor="let tip of getNeedDataResponse().quick_tips">{{ tip }}</li>
            </ul>
          </div>

          <div class="examples-section">
            <h2>📝 דוגמאות</h2>
            <div class="examples-list">
              <div class="example-item" *ngFor="let example of getNeedDataResponse().examples">
                "{{ example }}"
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Non Financial Response -->
      <div *ngIf="response?.response_type === 'non_financial'" class="non-financial">
        <div class="non-financial-container">
          
          <div class="non-financial-header">
            <h1>🤖 מחוץ לתחום המומחיות</h1>
            <p>{{ getNonFinancialResponse().message }}</p>
          </div>

          <div class="suggestion-section">
            <h2>💭 הצעה</h2>
            <p>{{ getNonFinancialResponse().suggestion }}</p>
          </div>

          <div class="help-section">
            <h2>💰 איך אני יכול לעזור?</h2>
            <ul class="help-list">
              <li>תכנון תקציב אישי ומשפחתי</li>
              <li>ייעוץ השקעות והלוואות</li>
              <li>חישובי משכנתא וביטוח</li>
              <li>תכנון פרישה וחיסכון</li>
              <li>ניתוח סיכונים פיננסיים</li>
            </ul>
          </div>

          <div class="examples-section">
            <h2>🎯 דוגמאות לשאלות פיננסיות</h2>
            <div class="example-questions">
              <div class="example-question" *ngFor="let example of getNonFinancialResponse().financial_examples">
                {{ example }}
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  `,
  styleUrls: ['./financial-advisor.component.scss']
})
export class FinancialAdvisorComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() response: FinancialResponse | null = null;
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];

  constructor() {
    Chart.register(...registerables);
  }

  ngOnInit() {
    console.log('Component initialized with response:', this.response);
  }

  ngAfterViewInit() {
    if (this.response?.response_type === 'advanced_analysis') {
      setTimeout(() => this.initializeCharts(), 100);
    }
  }

  ngOnDestroy() {
    this.destroyCharts();
  }

  // Type guards
  getAdvancedResponse(): AdvancedAnalysisResponse {
    return this.response as AdvancedAnalysisResponse;
  }

  getBasicResponse(): BasicFinancialResponse {
    return this.response as BasicFinancialResponse;
  }

  getNeedDataResponse(): NeedMoreDataResponse {
    return this.response as NeedMoreDataResponse;
  }

  getNonFinancialResponse(): NonFinancialResponse {
    return this.response as NonFinancialResponse;
  }

  // עיצוב נוסחאות מתמטיות
  formatFormula(formula: string, variables: { [key: string]: number | string }): string {
    let formatted = formula;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      formatted = formatted.replace(regex, `<span class="var-name">${key}</span> = <span class="var-value">${value}</span>`);
    });
    return formatted;
  }

  // יצירת גרפים
  private initializeCharts() {
    const advancedResponse = this.getAdvancedResponse();
    
    if (!advancedResponse.visualizations) return;

    advancedResponse.visualizations.forEach((viz, index) => {
      const canvasId = `chart-${index}`;
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
      
      if (!canvas) return;

      const config: ChartConfiguration = {
        type: viz.type as ChartType,
        data: viz.data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: viz.title,
              color: '#e0e0e0',
              font: { size: 16 }
            },
            legend: {
              labels: { color: '#e0e0e0' }
            }
          },
          scales: viz.type !== 'pie' && viz.type !== 'doughnut' ? {
            x: {
              ticks: { color: '#a0aec0' },
              grid: { color: '#2d3748' }
            },
            y: {
              ticks: { color: '#a0aec0' },
              grid: { color: '#2d3748' }
            }
          } : {}
        }
      };

      const chart = new Chart(canvas, config);
      this.charts.push(chart);
    });
  }

  private destroyCharts() {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
  }
}

