import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, ChangeDetectorRef, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { marked } from 'marked';
import { CommonModule } from '@angular/common';
import { lastValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LaTeXFixerService } from './services/latex-fixer.service';
import { ConversationDialogComponent } from "./components/conversation-dialog/conversation-dialog.component";
import { ConversationService, FullConversation } from './services/conversation.service';

interface Message {
  sender: 'user' | 'ai';
  message: string | SafeHtml;
  timestamp: Date;
  id: string;
  agentsUsed?: Array<{ agent_id: string; agent_name: string; agent_icon: string }>;
  mode?: 'single' | 'multi' | 'error';
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, ConversationDialogComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit, OnDestroy, OnInit {

  private readonly apiUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:15001'
    : 'http://shilmanlior2608.ddns.net:15001';

  conversation: Message[] = [];

  private resizeObserver?: ResizeObserver;

  isEditingLastMessage = false;
  editingMessageText = '';
  editingMessageId = '';

  // 🆕 Help modal
  showHelpModal = false;

  toggleHelpModal() { this.showHelpModal = !this.showHelpModal; }

  sendFromHelp(question: string) {
    this.showHelpModal = false;
    this.userInput = question;
    setTimeout(() => this.sendMessage(), 100);
  }

  // 🆕 MongoDB Integration
  showConversationDialog = false;
  currentConversationTitle = '';
  isConversationSaved = false;
  lastSaveTime: Date | null = null;

  conversations: any[] = [];
  currentConversation: any = null;
  currentSessionId: string = '';
  messages: any[] = [];

  sessionId = this.generateUUID();
  userInput = '';
  loading = false;
  isTyping = false;
  typingTimeout: any;

  @ViewChild('chatBox') chatBox!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef, private sanitizer: DomSanitizer, private laTexFixer: LaTeXFixerService,
    private conversationService: ConversationService) {
    //this.loadConversationFromStorage();
    this.loadMathJax();
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  ngAfterViewInit() {
    this.addWelcomeMessage();
    this.focusInput();
    this.setupChartResponsiveness();
    this.addChartStabilityCSS(); // 🎯 הוסף CSS ייצוב
  }

  // 3. הוסף פונקציה חדשה:
  private setupChartResponsiveness() {
    // התאמת גרפים לשינויי גודל מסך
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeAllCharts();
    });
    
    // צפיה על chatBox לשינויי גודל
    if (this.chatBox?.nativeElement) {
      this.resizeObserver.observe(this.chatBox.nativeElement);
    }
    
    // צפיה על החלון הראשי
    window.addEventListener('resize', () => {
      this.resizeAllCharts();
    });
  }

  ngOnDestroy() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  ngOnInit() {
    // טעינה אוטומטית בעליית העמוד
    this.loadConversations();

    // בתוך sendMessage() או handleResponse()
    const scrollButton = document.querySelector('.scroll-to-bottom');
    if (scrollButton) {
      scrollButton.classList.add('has-new-messages');

      // הסרת האפקט אחרי 3 שניות
      setTimeout(() => {
        scrollButton.classList.remove('has-new-messages');
      }, 3000);
    }

  }

  /**
   * 🔄 עריכת ההודעה האחרונה של המשתמש
   */
  editLastUserMessage() {
    const lastUserMessage = this.getLastUserMessage();
    if (!lastUserMessage) {
      alert('❌ לא נמצאה הודעה של משתמש לעריכה');
      return;
    }

    this.isEditingLastMessage = true;
    this.editingMessageText = lastUserMessage.message as string;
    this.editingMessageId = lastUserMessage.id;

    console.log('✏️ מתחיל עריכת הודעה:', lastUserMessage.message);

    // גלילה להודעה הנערכת ופוקוס על הטקסט
    setTimeout(() => {
      this.scrollToBottom();
      const editTextarea = document.querySelector('.edit-message-textarea') as HTMLTextAreaElement;
      if (editTextarea) {
        editTextarea.focus();
        editTextarea.select();
      }
    }, 100);
  }

  /**
   * 💾 שמירת העריכה ושליחה מחדש
   */
  async saveEditedMessage() {
    if (!this.editingMessageText.trim()) {
      alert('❌ הודעה לא יכולה להיות ריקה');
      return;
    }

    const originalMessage = this.conversation.find(msg => msg.id === this.editingMessageId);
    if (!originalMessage) {
      console.error('❌ לא נמצאה ההודעה המקורית לעדכון');
      return;
    }

    // מציאת האינדקס של ההודעה המקורית
    const messageIndex = this.conversation.findIndex(msg => msg.id === this.editingMessageId);
    if (messageIndex === -1) {
      console.error('❌ לא נמצא אינדקס ההודעה');
      return;
    }

    console.log('💾 שומר הודעה מערוכת:', this.editingMessageText);

    // שמירת הטקסט החדש
    const newMessageText = this.editingMessageText.trim();

    // מחיקת כל ההודעות מהנקודה הזו ואילך (כולל תגובות AI)
    this.conversation = this.conversation.slice(0, messageIndex);

    // יציאה ממצב עריכה
    this.isEditingLastMessage = false;
    this.editingMessageText = '';
    this.editingMessageId = '';

    // הוספת ההודעה המעודכנת
    const updatedMessage: Message = {
      sender: 'user',
      message: newMessageText,
      timestamp: new Date(),
      id: this.generateMessageId()
    };

    this.conversation.push(updatedMessage);
    this.cdr.detectChanges();
    this.scrollToBottom();

    // שליחת ההודעה המעודכנת לשרת
    this.loading = true;

    try {
      const response = await lastValueFrom(this.http.post<any>(`${this.apiUrl}/api/chat`, {
        sessionId: this.sessionId,
        message: newMessageText,
        timestamp: new Date().toISOString()
      }));

      const rawMarkdown = response?.markdown ?? response?.message ?? 'מצטער, לא הצלחתי לקבל תשובה מהשרת.';
      const processedHtml = await this.safeMarkedWithMath(rawMarkdown);

      await this.handleResponse(processedHtml, this.generateMessageId(), new Date());
      this.saveConversationManually();

      console.log('✅ הודעה מעודכנת נשלחה ותגובה התקבלה');

    } catch (error) {
      console.error('❌ שגיאה בשליחת הודעה מעודכנת:', error);

      await this.handleResponse(
        `<div style="color: #ff6b6b; text-align: center; padding: 15px;">
          <h3>⚠️ שגיאה בעדכון הודעה</h3>
          <p>לא הצלחתי לשלוח את ההודעה המעודכנת. נסה שוב.</p>
        </div>`,
        this.generateMessageId(),
        new Date()
      );
    } finally {
      this.loading = false;
      this.focusInput();
    }
  }

  /**
   * ❌ ביטול עריכה
   */
  cancelEditMessage() {
    this.isEditingLastMessage = false;
    this.editingMessageText = '';
    this.editingMessageId = '';
    console.log('❌ עריכה בוטלה');
  }

  /**
   * 🗑️ מחיקת ההודעה האחרונה של המשתמש (והתגובות שאחריה)
   */
  /**
   * 🗑️ מחיקת ההודעה האחרונה של המשתמש (והתגובות שאחריה) - גרסה מתוקנת
   */
  async deleteLastUserMessage() {
    const lastUserMessage = this.getLastUserMessage();
    if (!lastUserMessage) {
      alert('❌ לא נמצאה הודעה של משתמש למחיקה');
      return;
    }

    const messageText = (lastUserMessage.message as string).substring(0, 50);
    const ellipsis = messageText.length >= 50 ? '...' : '';

    const confirmMessage = '🗑️ האם אתה בטוח שברצונך למחוק את ההודעה האחרונה?\n\n' +
      '"' + messageText + ellipsis + '"\n\n' +
      'פעולה זו תמחק גם את תגובת ה-AI שלאחריה.';

    const confirmDelete = confirm(confirmMessage);

    if (!confirmDelete) return;

    // מציאת האינדקס של ההודעה
    const messageIndex = this.conversation.findIndex(msg => msg.id === lastUserMessage.id);
    if (messageIndex === -1) {
      console.error('❌ לא נמצא אינדקס ההודעה למחיקה');
      return;
    }

    // שמירת מספר ההודעות שנמחקו לדיווח
    const deletedCount = this.conversation.length - messageIndex;

    // מחיקת ההודעה וכל מה שאחריה
    this.conversation = this.conversation.slice(0, messageIndex);

    console.log(`🗑️ נמחקו ${deletedCount} הודעות החל מהודעת המשתמש`);

    // 🚨 עדכון תצוגה ושמירה מיידית לשרת
    this.cdr.detectChanges();
    this.scrollToBottom();

    // 🔥 שמירה מיידית לשרת לפני הצגת הודעת האישור
    try {
      await this.saveConversationToServer();

      // הצגת הודעת אישור רק אחרי שמירה מוצלחת
      setTimeout(() => {
        const confirmationMessage = deletedCount === 1
          ? '✅ ההודעה נמחקה ונשמרה בהצלחה'
          : `✅ נמחקו ${deletedCount} הודעות ונשמרו בהצלחה`;

        this.showTemporaryMessage(confirmationMessage, 'success');
      }, 300);

    } catch (error) {
      console.error('❌ שגיאה בשמירה אחרי מחיקה:', error);
      this.showTemporaryMessage('❌ שגיאה בשמירת המחיקה בשרת', 'error');
    }
  }

  /**
   * 💾 שמירה ישירה לשרת אחרי מחיקה (רק עבור מחיקות!)
   * כאן כן נשלח את ההודעות המעודכנות אחרי מחיקה
   */
  private async saveConversationToServer(): Promise<void> {
    const messages = this.conversation
      .filter(msg => msg && msg.message)
      .map((msg, index) => {
        let rawContent = msg.sender === 'ai'
          ? this.extractRawContentFromSafeHtml(msg.message)
          : msg.message as string;

        return {
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: rawContent,
          timestamp: msg.timestamp || new Date().toISOString(),
          id: msg.id || `msg_${Date.now()}_${index}`,
          sender: msg.sender,
          message: rawContent
        };
      })
      .filter(msg => msg !== null);

    const payload = {
      messages: messages,
      metadata: {
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        lastActivity: new Date().toISOString(),
        deletedMessages: true,
        updatedFromClient: true
      }
    };

    return this.http.put<any>(`${this.apiUrl}/api/conversations/${this.sessionId}/save`, payload).toPromise();
  }

  /**
   * 💾 שמירה אוטומטית - גירסה מקורית (ללא שינוי!)
   * השרת ישתמש ב-getConversationSession לקבלת התוכן הגולמי מהזיכרון
   */
  autoSaveConversation() {
    if (this.conversation.length <= 1) return;
    if (this.loading) return;

    const payload = {
      metadata: {
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        lastActivity: new Date().toISOString(),
        autoSaved: true, // 🔥 חשוב!
        messageCount: this.conversation.length
      }
    };

    this.http.post<any>(`${this.apiUrl}/api/conversations/save`, payload).subscribe({
      next: (response: { success: any; conversation: { title: string; }; error?: string }) => {
        console.log('📥 תגובה מהשרת בשמירה אוטומטית:', response);

        if (response.success) {
          this.isConversationSaved = true;
          this.lastSaveTime = new Date();
          this.currentConversationTitle = response.conversation?.title || this.generateConversationTitle();
          console.log(`✅ שיחה נשמרה אוטומטית מהזיכרון: ${this.currentConversationTitle}`);
        } else {
          console.error('❌ השרת החזיר success: false בשמירה אוטומטית:', response.error);
          this.isConversationSaved = false;
        }
      },
      error: (error: any) => {
        console.error('❌ שגיאה בשמירה אוטומטית:', error);
        console.error('📊 HTTP Status:', error.status);
        console.error('📊 Error Message:', error.message);
        console.error('📊 Payload שנשלח:', payload);
        this.isConversationSaved = false;
      }
    });
  }

  /**
   * 🔄 חילוץ תוכן גולמי מ-SafeHtml (נותר כמו שהיה)
   */
  private extractRawContentFromSafeHtml(safeHtml: string | SafeHtml): string {
    try {
      if (typeof safeHtml === 'string') {
        return safeHtml;
      }

      if (!safeHtml) {
        return '';
      }

      // אם זה SafeHtml, ננסה לחלץ את התוכן הגולמי
      const htmlString = safeHtml.toString();

      // אם יש תוכן מתמטי, נחזיר אותו כמו שהוא
      if (htmlString.includes('MATHD{') || htmlString.includes('MATHI{')) {
        return htmlString;
      }

      // אחרת ננקה HTML בסיסי
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlString;
      return tempDiv.textContent || tempDiv.innerText || htmlString;

    } catch (error) {
      console.error('❌ שגיאה בחילוץ תוכן גולמי:', error);
      return safeHtml?.toString() || '';
    }
  }

  /**
   * 🔍 מציאת ההודעה האחרונה של המשתמש
   */
  private getLastUserMessage(): Message | null {
    for (let i = this.conversation.length - 1; i >= 0; i--) {
      if (this.conversation[i].sender === 'user') {
        return this.conversation[i];
      }
    }
    return null;
  }

  /**
   * 📊 בדיקה האם יש הודעה אחרונה של משתמש שניתן לערוך/למחוק
   */
  canEditOrDeleteLastMessage(): boolean {
    const lastUserMessage = this.getLastUserMessage();
    return lastUserMessage !== null && !this.loading && !this.isEditingLastMessage;
  }

  /**
   * 📊 בדיקה האם זו ההודעה האחרונה של המשתמש
   */
  isLastUserMessage(messageId: string): boolean {
    const lastUserMessage = this.getLastUserMessage();
    return lastUserMessage?.id === messageId;
  }

  /**
   * 📱 הצגת הודעה זמנית (Toast)
   */
  private showTemporaryMessage(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
    // יצירת אלמנט הודעה זמנית
    const toast = document.createElement('div');
    toast.className = `temporary-message ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-weight: 600;
      animation: slideInRight 0.3s ease-out;
      direction: rtl;
    `;

    document.body.appendChild(toast);

    // הסרה אחרי זמן מוגדר
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  /**
   * ⌨️ טיפול במקשי קיצור בעריכה
   */
  onEditKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEditedMessage();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditMessage();
    }
  }

  /**
   * 📏 התאמת גובה textarea בעריכה
   */
  autoGrowEdit(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'; // מקסימום 200px
  }


  // 📋 טעינת כל השיחות (לסיידבר)
  async loadConversations() {
    try {
      this.loading = true;
      const response = await this.http.get<any>(`${this.apiUrl}/api/conversations`).toPromise();

      if (response.success) {
        this.conversations = response.conversations || [];

        // אם יש שיחות, טען את האחרונה
        /* if (this.conversations.length > 0 && !this.currentSessionId) {
          const lastConversation = this.conversations[0]; // הראשונה ברשימה (הכי חדשה)
          this.loadConversation(lastConversation.sessionId);
        } */

        // דיבוג מפורט
        console.log('📋 נטענו', this.conversations.length, 'שיחות');
        console.log('📋 רשימת השיחות המלאה:', this.conversations);

        if (this.conversations.length > 0) {
          console.log('🔍 השיחה הראשונה:', this.conversations[0]);
          console.log('📝 הודעות בשיחה הראשונה:', this.conversations[0].messages);
          console.log('📊 מטאדטה:', this.conversations[0]);

          // בדיקת שדות נדרשים לתצוגה
          const firstConv = this.conversations[0];
          console.log('🔧 בדיקת שדות:');
          console.log('- title:', firstConv.title);
          console.log('- description:', firstConv.description);
          console.log('- category:', firstConv.category);
          console.log('- messageCount:', firstConv.messageCount);
          console.log('- tags:', firstConv.tags);
          console.log('- createdAt:', firstConv.createdAt);
          console.log('- isFavorite:', firstConv.isFavorite);
          console.log('- performance:', firstConv.performance);
        }

        // בדיקה אם האלמנט קיים ב-DOM
        setTimeout(() => {
          const conversationElements = document.querySelectorAll('.conversation-item');
          console.log('🎯 נמצאו', conversationElements.length, 'אלמנטי שיחה ב-DOM');

          if (conversationElements.length === 0) {
            console.warn('⚠️ לא נמצאו אלמנטי .conversation-item ב-DOM!');
            console.log('🔍 בודק אם יש שגיאות בtemplate...');
          }
        }, 100);

      } else {
        console.error('❌ השרת החזיר success: false');
      }
    } catch (error) {
      console.error('❌ שגיאה בטעינת שיחות:', error);
      this.conversations = [];
    } finally {
      this.loading = false;
    }
  }

  // 📖 טעינת שיחה ספציפית (כשלוחצים על שיחה בסיידבר)
  async loadConversation(sessionId: string) {
  try {
    this.loading = true;
    console.log('📖 טוען שיחה בטוחה:', sessionId);

    const response = await this.http.get<any>(`${this.apiUrl}/api/conversations/${sessionId}`).toPromise();

    if (response.success) {
      this.currentConversation = response.conversation;
      this.currentSessionId = sessionId;

      // ניקוי השיחה הנוכחית
      this.conversation = [];

      const messages = response.conversation.messages || [];
      console.log('🔄 מעבד', messages.length, 'הודעות בטוחות');

      // רשימה לשמירת כל הסקריפטים של הודעות ה-AI
      const allAiScripts: string[] = [];

      // עיבוד הודעות עם טיפול בטוח
      for (const msg of messages) {
        try {
          if (msg.sender === 'user') {
            // הודעת משתמש - ישירות
            this.conversation.push({
              sender: 'user',
              message: msg.message,
              timestamp: new Date(msg.timestamp),
              id: msg.messageId || this.generateMessageId()
            });
          } else {
            // הודעת AI - עיבוד דרך safeMarkedWithMath
            console.log('🤖 מעבד הודעת AI בטוחה:', msg.message.substring(0, 50) + '...');

            try {
              const processedHtml = await this.safeMarkedWithMath(msg.message);
              const safeHtml = this.sanitizer.bypassSecurityTrustHtml(processedHtml);

              this.conversation.push({
                sender: 'ai',
                message: safeHtml,
                timestamp: new Date(msg.timestamp),
                id: msg.messageId || this.generateMessageId()
              });

              // שמירת הסקריפטים מההודעה הזו
              allAiScripts.push(processedHtml);
              
            } catch (aiProcessError) {
              console.error('❌ שגיאה בעיבוד הודעת AI:', aiProcessError);
              
              // fallback - הצג ללא עיבוד
              this.conversation.push({
                sender: 'ai',
                message: this.sanitizer.bypassSecurityTrustHtml(msg.message || 'הודעה פגומה'),
                timestamp: new Date(msg.timestamp),
                id: msg.messageId || this.generateMessageId()
              });
            }
          }
        } catch (messageError) {
          console.error('❌ שגיאה בעיבוד הודעה:', messageError);
          // המשך לטיפול בהודעה הבאה
        }
      }

      // עדכון session ID
      this.sessionId = sessionId;

      // עדכון כותרת החלון
      if (response.conversation.title) {
        document.title = `${response.conversation.title} - יועץ פיננסי`;
      }

      console.log('✅ שיחה נטענה בהצלחה:', response.conversation.title);
      console.log('💬 הודעות בתצוגה:', this.conversation.length);

      // עדכון תצוגה
      this.cdr.detectChanges();

      // 🎯 רנדור MathJax וטבלאות אחרי טעינה - עם טיפול בטוח ורספונסיבי
      setTimeout(async () => {
        try {
          await this.ensureMathJaxLoaded();
        } catch (err) {
          console.error('❌ שגיאה בטעינת MathJax:', err);
        }

        // הרצת סקריפטים מכל ההודעות - עם תיקון רספונסיבי ובטוח
        for (const htmlContent of allAiScripts) {
          try {
            await this.executeScriptsFromHtmlResponsive(htmlContent);
          } catch (scriptError) {
            console.warn('⚠️ שגיאה בהרצת סקריפט מהשיחה השמורה:', scriptError);
            // המשך לסקריפט הבא
          }
        }

        // 🎯 שלב 1: עיצוב טבלאות ורנדור MathJax
        setTimeout(() => {
          try {
            this.forceTableStyling();
            this.forceRenderMathJax();
          } catch (stylingError) {
            console.warn('⚠️ שגיאה בעיצוב:', stylingError);
          }
        }, 300);

        // 🎯 שלב 2: טיפול רספונסיבי בגרפים שנטענו
        setTimeout(() => {
          try {
            console.log('🎨 מעבד גרפים רספונסיביים אחרי טעינת שיחה...');
            
            // זיהוי וסידור גרפים זה לצד זה
            this.processLoadedChartsResponsive();
            
            // וידוא שכל הגרפים רספונסיביים
            this.ensureAllChartsAreResponsive();
            
            // התאמת גדלים לרוחב המסך הנוכחי
            this.resizeAllCharts();
            
          } catch (chartsError) {
            console.warn('⚠️ שגיאה בעיבוד גרפים:', chartsError);
          }
        }, 800);

        // 🎯 שלב 3: ולידציה סופית ותיקוני גיבוי
        setTimeout(() => {
          try {
            this.finalResponsiveValidation();
          } catch (validationError) {
            console.warn('⚠️ שגיאה בולידציה סופית:', validationError);
          }
        }, 1200);

      }, 500);

    } else {
      console.error('❌ שגיאה בטעינת שיחה:', response.error);
      this.showError('לא ניתן לטעון את השיחה');
    }

  } catch (error) {
    console.error('❌ שגיאה כללית בטעינת שיחה:', error);
    this.showError('שגיאה בטעינת השיחה');
  } finally {
    this.loading = false;
  }
}

private processLoadedChartsResponsive() {
  const chatElement = this.chatBox?.nativeElement;
  if (!chatElement) return;

  console.log('🔍 מחפש גרפים שנטענו מהשרת...');

  // מצא כל ה-canvas elements
  const allCanvases = chatElement.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;
  console.log(`📊 נמצאו ${allCanvases.length} גרפים`);

  if (allCanvases.length === 0) return;

  // קבץ גרפים בזוגות לפי הודעות AI
  this.groupCanvasElementsInPairs(allCanvases);
}

private groupCanvasElementsInPairs(canvases: NodeListOf<HTMLCanvasElement>) {
  const processedCanvases = new Set<HTMLCanvasElement>();

  // עבור על כל הגרפים
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i];
    
    // דלג על גרפים שכבר עובדו
    if (processedCanvases.has(canvas)) continue;

    // חפש גרף נוסף באותה הודעה
    const nextCanvas = this.findNextCanvasInSameMessage(canvas, canvases, processedCanvases);

    if (nextCanvas) {
      // נמצא זוג - עטוף אותם יחד
      this.wrapCanvasPairInFlexContainer(canvas, nextCanvas);
      
      processedCanvases.add(canvas);
      processedCanvases.add(nextCanvas);
      
      console.log('🎯 עטפתי זוג גרפים בcontainer רספונסיבי');
    } else {
      // גרף יחיד - וודא שהוא רספונסיבי
      this.makeCanvasResponsive(canvas);
      processedCanvases.add(canvas);
    }
  }
}

private wrapCanvasPairInFlexContainer(canvas1: HTMLCanvasElement, canvas2: HTMLCanvasElement) {
  // יצירת container רספונסיבי
  const chartsContainer = document.createElement('div');
  chartsContainer.className = 'charts-container';
  
  // יצירת wrapper לגרף הראשון
  const wrapper1 = document.createElement('div');
  wrapper1.className = 'chart-wrapper';
  
  const title1 = document.createElement('div');
  title1.className = 'chart-title';
  title1.textContent = this.generateChartTitle(canvas1, 1);
  
  wrapper1.appendChild(title1);
  
  // העבר את הגרף הראשון
  const canvas1Parent = canvas1.parentElement;
  if (canvas1Parent) {
    wrapper1.appendChild(canvas1Parent);
  } else {
    wrapper1.appendChild(canvas1);
  }
  
  // יצירת wrapper לגרף השני
  const wrapper2 = document.createElement('div');
  wrapper2.className = 'chart-wrapper';
  
  const title2 = document.createElement('div');
  title2.className = 'chart-title';
  title2.textContent = this.generateChartTitle(canvas2, 2);
  
  wrapper2.appendChild(title2);
  
  // העבר את הגרף השני
  const canvas2Parent = canvas2.parentElement;
  if (canvas2Parent) {
    wrapper2.appendChild(canvas2Parent);
  } else {
    wrapper2.appendChild(canvas2);
  }
  
  // הרכב את הכל
  chartsContainer.appendChild(wrapper1);
  chartsContainer.appendChild(wrapper2);
  
  // הכנס את הcontainer במקום הגרף הראשון
  const insertionPoint = canvas1Parent?.parentElement || canvas1.parentElement;
  if (insertionPoint) {
    insertionPoint.appendChild(chartsContainer);
  }
}

private generateChartTitle(canvas: HTMLCanvasElement, index: number): string {
  const canvasId = canvas.id || '';
  
  if (canvasId.includes('yield') || canvasId.includes('term')) {
    return index === 1 ? '📈 התפתחות תשואה בטווח הארוך' : '📊 ניתוח השוואתי';
  }
  
  if (canvasId.includes('allocation') || canvasId.includes('pie') || canvasId.includes('doughnut')) {
    return index === 1 ? '🥧 פיזור השקעות' : '📊 הקצאת נכסים';
  }
  
  if (canvasId.includes('contribution')) {
    return index === 1 ? '💰 תרומת הפקדות' : '📈 ריבית מצטברת';
  }
  
  return index === 1 ? '📊 גרף ראשון' : '📈 גרף שני';
}


private findNextCanvasInSameMessage(
  canvas: HTMLCanvasElement, 
  allCanvases: NodeListOf<HTMLCanvasElement>, 
  processed: Set<HTMLCanvasElement>
): HTMLCanvasElement | null {
  
  const parentMessage = canvas.closest('.message.ai');
  if (!parentMessage) return null;

  // חפש גרף נוסף באותה הודעה
  for (let i = 0; i < allCanvases.length; i++) {
    const otherCanvas = allCanvases[i];
    
    if (otherCanvas === canvas || processed.has(otherCanvas)) continue;
    
    const otherParentMessage = otherCanvas.closest('.message.ai');
    
    if (otherParentMessage === parentMessage) {
      return otherCanvas;
    }
  }
  
  return null;
}

private makeCanvasResponsive(canvas: HTMLCanvasElement) {
  // הוסף classes רספונסיביים
  canvas.classList.add('financial-chart', 'responsive-chart');
  
  // וודא שיש container מתאים
  let wrapper = canvas.closest('.chart-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'chart-wrapper single-chart';
    
    const parent = canvas.parentElement;
    if (parent) {
      parent.insertBefore(wrapper, canvas);
      wrapper.appendChild(canvas);
    }
  }
}


private ensureAllChartsAreResponsive() {
  const chatElement = this.chatBox?.nativeElement;
  if (!chatElement) return;

  const allCanvases = chatElement.querySelectorAll('canvas');
  
  allCanvases.forEach((canvas: HTMLCanvasElement) => {
    // הוסף CSS רספונסיבי
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.maxHeight = '400px';
    canvas.style.display = 'block';
    
    // וודא שיש Chart.js instance ושהוא רספונסיבי
    const chartId = canvas.id;
    if (chartId && (window as any).Chart) {
      const chartInstance = (window as any).Chart.getChart(chartId);
      if (chartInstance && chartInstance.options) {
        chartInstance.options.responsive = true;
        chartInstance.options.maintainAspectRatio = false;
        chartInstance.update('none'); // עדכון מהיר ללא אנימציה
      }
    }
  });
  
  console.log(`✅ וידאתי רספונסיביות של ${allCanvases.length} גרפים`);
}

private finalResponsiveValidation() {
  console.log('🔍 מבצע ולידציה סופית לרספונסיביות...');
  
  const chatElement = this.chatBox?.nativeElement;
  if (!chatElement) return;

  // בדוק שאין גרפים שעולים על הרוחב
  const allCanvases = chatElement.querySelectorAll('canvas');
  let fixedCount = 0;

  allCanvases.forEach((canvas: HTMLCanvasElement) => {
    const computedStyle = window.getComputedStyle(canvas);
    const canvasWidth = parseFloat(computedStyle.width);
    const containerWidth = chatElement.clientWidth;

    if (canvasWidth > containerWidth) {
      console.warn(`⚠️ גרף ${canvas.id} עולה על רוחב המכיל: ${canvasWidth}px > ${containerWidth}px`);
      
      // תיקון מיידי
      canvas.style.width = '100%';
      canvas.style.maxWidth = '100%';
      fixedCount++;
    }
  });

  // וודא שאין overflow אופקי
  const horizontalOverflow = chatElement.scrollWidth > chatElement.clientWidth;
  if (horizontalOverflow) {
    console.warn('⚠️ זוהה overflow אופקי - מתקן...');
    chatElement.style.overflowX = 'hidden';
  }

  console.log(`✅ ולידציה הושלמה. תוקנו ${fixedCount} גרפים`);
  
  // הפעל שינוי גודל סופי
  setTimeout(() => {
    this.resizeAllCharts();
  }, 200);
}


// 🎯 החלף את executeScriptsFromHtmlResponsive עם תיקון TypeScript

private async executeScriptsFromHtmlResponsive(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scripts = doc.querySelectorAll('script');
  
  try {
    await this.ensureChartJsLoaded();
  } catch (loadError) {
    console.error('❌ Failed to load Chart.js:', loadError);
    return;
  }

  scripts.forEach((script, index) => {
    try {
      let code = script.textContent;
      if (!code) return;
      
      // תיקון פורמט מספרים
      code = code.replace(/\{\,\}/g, ',');
      code = code
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");

      // 🎯 הוספת בדיקות בטיחות לכל getElementById
      code = code.replace(
        /document\.getElementById\("([^"]+)"\)\.getContext\("2d"\)/g,
        (match, canvasId) => {
          return `(function() {
            const canvas = document.getElementById("${canvasId}");
            if (!canvas) {
              console.error("❌ Canvas not found: ${canvasId}");
              return null;
            }
            return canvas.getContext("2d");
          })()`;
        }
      );

      // בדיקות נוספות לcanvas
      code = code.replace(
        /const ctx = document\.getElementById\("([^"]+)"\)/g,
        (match, canvasId) => {
          return `const canvasEl = document.getElementById("${canvasId}");
          if (!canvasEl) {
            console.error("❌ Canvas element not found: ${canvasId}");
            return;
          }
          const ctx = canvasEl`;
        }
      );

      // 🎯 הפיכת הקוד לרספונסיבי
      code = this.makeChartCodeResponsive(code);
      
      // 🎯 הוספת זיהוי אוטומטי לגרפים זוגיים
      code = this.addChartPairingLogic(code, index);

      console.log(`🚀 מריץ סקריפט רספונסיבי ובטוח ${index + 1}`);
      
      // הרצה בטוחה עם try-catch נוסף וטיפול נכון ב-TypeScript
      try {
        new Function(code)();
      } catch (executionError: unknown) {
        // ✅ טיפול נכון ב-TypeScript error handling
        const errorMessage = executionError instanceof Error 
          ? executionError.message 
          : String(executionError);
          
        console.error(`❌ שגיאה בהרצת סקריפט ${index + 1}:`, executionError);
        console.error('📄 קוד שגרם לשגיאה:', code.substring(0, 300) + '...');
        
        // ניסיון חילוץ - אולי הבעיה בcanvas ספציפי
        if (errorMessage.includes('Cannot set properties of undefined')) {
          console.warn('🔧 מנסה לדלג על סקריפט פגום ולהמשיך...');
        }
      }
      
    } catch (processingError: unknown) {
      // ✅ טיפול נכון ב-TypeScript error handling
      console.error(`❌ שגיאה בעיבוד סקריפט ${index + 1}:`, processingError);
    }
  });
}

private addChartPairingLogic(code: string, scriptIndex: number): string {
  // אם זה הסקריפט השני בזוג, הוסף מזהה מיוחד
  if (scriptIndex % 2 === 1) {
    code = code.replace(
      /new Chart\(([^,]+),/g,
      `// Second chart in pair
       const chartContainer = $1.closest('.message');
       if (chartContainer) {
         chartContainer.classList.add('has-paired-charts');
       }
       new Chart($1,`
    );
  }
  
  return code;
}

  private showError(message: string) {
    // הצג הודעת שגיאה למשתמש (toast, alert, וכו')
    alert(message); // או שימוש בספרייה כמו ngx-toastr
  }


  // אפשר לקרוא לזה גם כשמתחילים שיחה חדשה
  onNewConversation() {
    this.loadConversations(); // רענון הרשימה
  }

  // פתיחת תיבת הדו-שיח לניהול שיחות
  openConversationDialog() {
    this.showConversationDialog = true;
  }

  // סגירת תיבת הדו-שיח
  closeConversationDialog() {
    this.showConversationDialog = false;
  }

  getConversationStatusColor(): string {
    if (this.isConversationSaved && this.lastSaveTime) {
      const timeDiff = Date.now() - this.lastSaveTime.getTime();
      if (timeDiff < 60000) {
        return '#4caf50'; // ירוק
      } else if (timeDiff < 300000) {
        return '#ff9800'; // כתום
      } else {
        return '#2196f3'; // כחול
      }
    }
    return '#f44336'; // אדום
  }

  // Status indicators for UI
  getConversationStatus(): string {
    if (this.isConversationSaved && this.lastSaveTime) {
      const timeDiff = Date.now() - this.lastSaveTime.getTime();
      if (timeDiff < 60000) { // פחות מדקה
        return '💾 נשמר עכשיו';
      } else if (timeDiff < 300000) { // פחות מ-5 דקות
        return '💾 נשמר לאחרונה';
      } else {
        return '💾 נשמר';
      }
    }
    return '⏳ לא נשמר';
  }

  // שמירה ידנית של השיחה
  saveConversationManually() {
    console.log('🖱️ שמירה ידנית נלחצה');

    if (this.conversation.length <= 1) {
      alert('❌ אין מספיק תוכן לשמירה (רק הודעת ברכות)');
      return;
    }

    console.log('💾 מבצע שמירה ידנית של', this.conversation.length, 'הודעות');

    this.autoSaveConversation();

    // אחרי שמירה - בדיקת סטטוס
    setTimeout(() => {
      if (this.isConversationSaved) {
        //alert('✅ השיחה נשמרה בהצלחה!');
      } else {
        alert('❌ שגיאה בשמירת השיחה - בדוק את החיבור לשרת');
      }
    }, 2000); // נותן זמן לשרת להגיב
  }

  // טעינת שיחה שנבחרה - גרסה מתוקנת
  async onConversationSelected(conversation: FullConversation) {
    // שמירת השיחה הנוכחית לפני טעינה
    if (this.conversation.length > 1) {
      this.autoSaveConversation();
    }
    
    // ניקוי השיחה הנוכחית
    this.conversation = [];
    
    // טעינת השיחה החדשה
    this.sessionId = conversation.sessionId;
    this.currentConversationTitle = conversation.title;
    this.isConversationSaved = true;
    this.lastSaveTime = new Date(conversation.updatedAt);
    
    console.log('🔄 מעבד', conversation.messages.length, 'הודעות מהשיחה השמורה');
    
    // המרת הודעות לפורמט המקומי - עם עיבוד נכון!
    for (const msg of conversation.messages) {
      if (msg.sender === 'user') {
        // הודעת משתמש - ישירות
        this.conversation.push({
          sender: 'user',
          message: msg.message,
          timestamp: new Date(msg.timestamp),
          id: msg.id
        });
      } else {
        // הודעת AI - עיבוד מלא כמו בhandleResponse
        console.log('🤖 מעבד הודעת AI גולמית:', msg.message.substring(0, 50) + '...');
        
        try {
          // וולידציה של canvas elements
          let processedMessage = this.validateCanvasElements(msg.message);
          
          // עיבוד דרך safeMarkedWithMath
          const processedHtml = await this.safeMarkedWithMath(processedMessage);
          const safeHtml = this.sanitizer.bypassSecurityTrustHtml(processedHtml);
          
          this.conversation.push({
            sender: 'ai',
            message: safeHtml,
            timestamp: new Date(msg.timestamp),
            id: msg.id
          });
          
          console.log('✅ הודעת AI עובדה בהצלחה');
          
          // עיבוד סקריפטים מה-HTML המקורי
          this.executeScriptsFromHtml(processedMessage);
          
        } catch (error) {
          console.error('❌ שגיאה בעיבוד הודעת AI:', error);
          // fallback - לפחות הצג משהו
          this.conversation.push({
            sender: 'ai',
            message: this.sanitizer.bypassSecurityTrustHtml(msg.message),
            timestamp: new Date(msg.timestamp),
            id: msg.id
          });
        }
      }
    }
    
    // שמירה לזיכרון המקומי
    //this.saveConversationToStorage();
    
    // עדכון התצוגה
    this.cdr.detectChanges();
    
    // רנדור MathJax וטבלאות - עם אותו timing כמו בhandleResponse
    setTimeout(async () => {
      try {
        await this.ensureMathJaxLoaded();
      } catch (err) {
        console.error('❌ שגיאה בטעינת MathJax:', err);
      }
      
      // טיפול בגרפים אחרי יצירה - עם ייצוב
      setTimeout(() => {
        this.forceTableStyling();
        this.stabilizeNewCharts();
        this.wrapChartsInFlexContainer();
      }, 800);
      
      // רנדור MathJax אחרי הכל
      setTimeout(() => {
        this.forceRenderMathJax();
        //this.scrollToBottom();
      }, 1200);
      
    }, 500);
    
    console.log(`📖 נטענה שיחה מעובדת: ${conversation.title}`);
  }



  // יצירת כותרת אוטומטית לשיחה
  generateConversationTitle(): string {
    const firstUserMessage = this.conversation.find(msg => msg.sender === 'user');
    if (firstUserMessage) {
      const messageText = typeof firstUserMessage.message === 'string'
        ? firstUserMessage.message
        : this.stripHtml(firstUserMessage.message as SafeHtml);
      return messageText.substring(0, 80).trim() || 'שיחה ללא כותרת';
    }
    return 'שיחה חדשה';
  }

  formatDate(date: Date | string): string {
    return this.conversationService.formatDate(date);
  }


  // יצירת session ID חדש
  startNewConversation() {
    if (confirm('האם אתה בטוח שברצונך להתחיל שיחה חדשה? השיחה הנוכחית תישמר אוטומטית.')) {
      // שמירה אוטומטית של השיחה הנוכחית
      if (this.conversation.length > 1) {
        this.autoSaveConversation();
      }

      // איפוס לשיחה חדשה
      this.sessionId = this.generateUUID();
      this.conversation = [];
      this.currentConversationTitle = '';
      this.isConversationSaved = false;
      this.lastSaveTime = null;

      // הסרה מהזיכרון המקומי
      //localStorage.removeItem(`financial_chat_${this.sessionId}`);

      // הוספת הודעת ברכות
      this.addWelcomeMessage();

      console.log(`🆕 התחילה שיחה חדשה: ${this.sessionId}`);
    }
  }


  private async ensureMathJaxLoaded(): Promise<void> {
  if (!(window as any).MathJax) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (error: Event | string) => {
        const errorMessage = typeof error === 'string' ? error : 'Failed to load MathJax';
        reject(new Error(`❌ ${errorMessage}`));
      };
      document.head.appendChild(script);
    });
  }
}




  handleResponse = async (rawHtml: string, id?: string, timestamp?: Date) => {
    // וולידציה של canvas elements
    rawHtml = this.validateCanvasElements(rawHtml);
    
    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);

    this.conversation.push({
      sender: 'ai',
      message: safeHtml,
      timestamp: timestamp ?? new Date(),
      id: id ?? crypto.randomUUID()
    });

    this.loading = false;

    setTimeout(async () => {
      try {
        await this.ensureMathJaxLoaded();
      } catch (err) {
        console.error('❌ שגיאה בטעינת MathJax:', err);
      }

      this.executeScriptsFromHtml(rawHtml);

      // טיפול בגרפים אחרי יצירה - עם ייצוב
      setTimeout(() => {
        this.forceTableStyling();
        this.stabilizeNewCharts();
        this.wrapChartsInFlexContainer();
      }, 800);

      // רנדור MathJax אחרי הכל
      setTimeout(() => {
        this.forceRenderMathJax();
      }, 1200);

    }, 500);
  };

  private resizeAllCharts() {
    const chartElements = document.querySelectorAll('canvas[id*="chart"]');

    chartElements.forEach((canvas: any) => {
      if (!canvas) return;
      
      try {
        const chartId = canvas.id;
        const chart = (window as any).Chart?.getChart(chartId);

        if (chart && chart.options) {
          // וודא גובה יציב לפני שינוי גודל
          if (canvas.style) {
            canvas.style.maxHeight = '400px';
            canvas.style.height = '400px';
          }
          
          // בצע שינוי גודל מוגבל
          setTimeout(() => {
            try {
              chart.options.responsive = false;
              chart.resize();
              
              setTimeout(() => {
                if (chart.options) {
                  chart.options.responsive = true;
                  chart.options.resizeDelay = 200;
                }
              }, 100);
            } catch (resizeError) {
              console.warn('⚠️ Chart resize error:', resizeError);
            }
          }, 50);
        }
      } catch (chartError) {
        console.warn('⚠️ Error resizing chart:', chartError);
      }
    });
  }


  // 8. הוסף פונקציה לזיהוי וסידור גרפים זה לצד זה:
  private wrapChartsInFlexContainer() {
    const chatElement = this.chatBox?.nativeElement;
    if (!chatElement) return;

    // מצא כל ה-divs שמכילים גרפים
    const chartDivs = chatElement.querySelectorAll('div:has(canvas), div[style*="flex"]');

    chartDivs.forEach((div: Element, index: number) => {
      const canvases = div.querySelectorAll('canvas');

      // אם יש 2 canvas elements ברצף, עטוף אותם ב-flex container
      if (canvases.length === 2) {
        const wrapper = document.createElement('div');
        wrapper.className = 'charts-container';

        canvases.forEach((canvas, canvasIndex) => {
          const chartWrapper = document.createElement('div');
          chartWrapper.className = 'chart-wrapper';

          // העתק את הקנבס והתוכן שלו
          const canvasParent = canvas.parentElement;
          if (canvasParent) {
            chartWrapper.appendChild(canvasParent.cloneNode(true));

            // הסר את המקור
            if (canvasIndex === 1) {
              canvasParent.remove();
            } else {
              canvasParent.style.display = 'none';
            }
          }

          wrapper.appendChild(chartWrapper);
        });

        // החלף את ה-div המקורי
        if (div.parentElement) {
          div.parentElement.insertBefore(wrapper, div);
          div.remove();
        }
      }
    });
  }


  /* handleResponse(rawHtml: string, id?: string, timestamp?: Date) {
    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(rawHtml);
    this.conversation.push({
      sender: 'ai',
      message: safeHtml,
      timestamp: timestamp ?? new Date(),
      id: id ?? crypto.randomUUID()
    });
    this.loading = false;

    setTimeout(() => {
      this.executeScriptsFromHtml(rawHtml);

      // רנדור MathJax לאחר הכנסת ה־HTML לדף
      setTimeout(() => {
        this.forceRenderMathJax();

      if ((window as any).MathJax?.typesetPromise) {
          (window as any).MathJax.typesetPromise().catch((err: any) => {
            console.error('MathJax rendering error:', err);
          });
        } 
      }, 2000);
    }, 50);
  } */

  private async executeScriptsFromHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scripts = doc.querySelectorAll('script');
  
  try {
    await this.ensureChartJsLoaded();
  } catch (loadError: unknown) {
    console.error('❌ Failed to load Chart.js:', loadError);
    return;
  }

  scripts.forEach((script, index) => {
    try {
      let code = script.textContent;
      if (!code) return;
      
      // ניקוי בסיסי
      code = code.replace(/\{\,\}/g, ',');
      code = code
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");

      // הוספת הגדרות יציבות
      code = this.makeChartCodeResponsive(code);

      console.log(`🚀 מריץ סקריפט יציב ${index + 1}`);
      
      // הרצה בטוחה עם TypeScript compliance
      try {
        new Function(code)();
        
        // ייצוב מיידי אחרי יצירה
        setTimeout(() => {
          this.stabilizeNewCharts();
        }, 300);
        
      } catch (executionError: unknown) {
        const errorMessage = executionError instanceof Error 
          ? executionError.message 
          : String(executionError);
          
        console.error(`❌ שגיאה בהרצת סקריפט ${index + 1}:`, executionError);
        console.error('📄 הקוד שגרם לשגיאה:', code.substring(0, 200) + '...');
      }
      
    } catch (processingError: unknown) {
      console.error(`❌ שגיאה בעיבוד סקריפט ${index + 1}:`, processingError);
    }
  });
}

  private validateCanvasElements(html: string): string {
    // וודא שיש בדיקות קיום לכל getElementById
    html = html.replace(
      /document\.getElementById\("([^"]+)"\)\.getContext\("2d"\)/g,
      (match, canvasId) => {
        return `(function() {
          const canvas = document.getElementById("${canvasId}");
          if (!canvas) {
            console.error("❌ Canvas element not found: ${canvasId}");
            return null;
          }
          return canvas.getContext("2d");
        })()`;
      }
    );

    // הוסף בדיקות לכל גישה לcanvas
    html = html.replace(
      /const ctx = document\.getElementById\("([^"]+)"\)/g,
      (match, canvasId) => {
        return `const canvasElement = document.getElementById("${canvasId}");
        if (!canvasElement) {
          console.error("❌ Canvas element not found: ${canvasId}");
          return;
        }
        const ctx = canvasElement`;
      }
    );

    return html;
  }


  private addChartStabilityCSS() {
    const styleId = 'chart-stability-styles';
    
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ייצוב גרפים */
      .financial-chart,
      canvas[id*="chart"] {
        height: 400px !important;
        max-height: 400px !important;
        width: 100% !important;
        display: block !important;
        transition: none !important;
      }
      
      .chart-wrapper {
        height: 450px !important;
        min-height: 450px !important;
        max-height: 450px !important;
        overflow: hidden;
        position: relative;
      }
      
      .charts-container {
        min-height: 450px;
      }
      
      .charts-container .chart-wrapper {
        flex: 1;
        min-width: 300px;
        max-width: calc(50% - 10px);
      }
      
      /* מניעת animation על גרפים */
      canvas[id*="chart"] * {
        transition: none !important;
        animation: none !important;
      }
      
      @media (max-width: 768px) {
        .chart-wrapper {
          height: 350px !important;
          min-height: 350px !important;
          max-height: 350px !important;
        }
        
        .financial-chart,
        canvas[id*="chart"] {
          height: 320px !important;
          max-height: 320px !important;
        }
        
        .charts-container .chart-wrapper {
          max-width: 100%;
          margin-bottom: 20px;
        }
      }
    `;

    document.head.appendChild(style);
  }


  private makeChartCodeResponsive(code: string): string {
    // הגדרות רספונסיביות יציבות
    const responsiveOptions = `
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    resizeDelay: 100,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10
      }
    },
    elements: {
      point: {
        radius: 3,
        hoverRadius: 5
      }
    },`;

    // הוסף הגדרות רספונסיביות יציבות אחרי options: {
    code = code.replace(
      /options:\s*\{/g,
      `options: {
      ${responsiveOptions}`
    );

    // תיקון הקוד בטוח יותר עם בדיקות
    code = code.replace(
      /new Chart\(([^,]+),\s*\{/g,
      (match, canvasRef) => {
        return `// Safe chart creation with validation
        const chartCanvas = ${canvasRef};
        if (!chartCanvas) {
          console.error('❌ Canvas element not found:', '${canvasRef}');
          return;
        }
        
        // Destroy existing chart if exists
        if (chartCanvas.chart) {
          chartCanvas.chart.destroy();
        }
        
        // Set stable dimensions safely
        try {
          chartCanvas.style.maxHeight = '400px';
          chartCanvas.style.height = '400px';
          chartCanvas.style.width = '100%';
        } catch(e) {
          console.warn('⚠️ Could not set canvas styles:', e);
        }
        
        const chartInstance = new Chart(chartCanvas, {
        devicePixelRatio: window.devicePixelRatio || 2,`;
      }
    );

    // תיקון בטוח יותר לסוף יצירת הגרף
    code = code.replace(
      /new Chart\([^}]+\}\);/gs,
      (match) => {
        return match + `
        
        // 🎯 Safe stabilization after creation
        if (typeof chartInstance !== 'undefined' && chartInstance && chartInstance.canvas) {
          setTimeout(() => {
            try {
              const canvas = chartInstance.canvas;
              if (canvas && canvas.style) {
                canvas.style.maxHeight = '400px';
                canvas.style.height = '400px';
                
                // Temporarily disable responsive to prevent size changes
                if (chartInstance.options) {
                  chartInstance.options.responsive = false;
                  chartInstance.options.maintainAspectRatio = true;
                  chartInstance.update('none');
                  
                  // Re-enable responsive after stabilization
                  setTimeout(() => {
                    if (chartInstance.options) {
                      chartInstance.options.responsive = true;
                    }
                  }, 500);
                }
              }
            } catch(stabilizeError) {
              console.warn('⚠️ Chart stabilization warning:', stabilizeError);
            }
          }, 200);
        }`;
      }
    );

    return code;
  }

  private stabilizeNewCharts() {
  const chatElement = this.chatBox?.nativeElement;
  if (!chatElement) return;

  const lastMessage = chatElement.querySelector('.message:last-child');
  if (!lastMessage) return;

  const newCanvases = lastMessage.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;
  
  newCanvases.forEach((canvas, index) => {
    if (!canvas) return;
    
    console.log(`🎯 מייצב גרף חדש ${index + 1}: ${canvas.id || 'אין ID'}`);
    
    try {
      canvas.style.height = '400px';
      canvas.style.maxHeight = '400px';
      canvas.style.width = '100%';
      canvas.style.display = 'block';
      
      const chartId = canvas.id;
      if (chartId && (window as any).Chart) {
        const chartInstance = (window as any).Chart.getChart(chartId);
        if (chartInstance && chartInstance.options) {
          setTimeout(() => {
            try {
              chartInstance.options.responsive = false;
              chartInstance.options.maintainAspectRatio = true;
              chartInstance.options.aspectRatio = 2;
              chartInstance.update('none');
              
              setTimeout(() => {
                if (chartInstance.options) {
                  chartInstance.options.responsive = true;
                  chartInstance.options.resizeDelay = 100;
                }
              }, 300);
              
            } catch (chartError: unknown) {
              console.warn('⚠️ Chart instance stabilization error:', chartError);
            }
          }, 100);
        }
      }
      
      try {
        const resizeObserver = new ResizeObserver(() => {
          try {
            if (canvas.style && canvas.style.height !== '400px') {
              canvas.style.height = '400px';
              canvas.style.maxHeight = '400px';
            }
          } catch (observerError: unknown) {
            console.warn('⚠️ ResizeObserver error:', observerError);
          }
        });
        
        resizeObserver.observe(canvas);
        
        setTimeout(() => {
          resizeObserver.disconnect();
        }, 5000);
        
      } catch (observerCreationError: unknown) {
        console.warn('⚠️ Could not create ResizeObserver:', observerCreationError);
      }
      
    } catch (canvasError: unknown) {
      console.error('❌ Error stabilizing canvas:', canvasError);
    }
  });
}
  

  // 🆕 פונקציה נוספת לניקוי קוד לפני הרצה
  private cleanScriptCode(code: string): string {
    return code
      // תיקון פורמט מספרים
      .replace(/\{\,\}/g, ',')
      // תיקון HTML entities
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // הסרת רווחים מיותרים
      .trim();
  }

  // טעינת MathJax באופן דינמי - תיקון הקונפיגורציה
  private loadMathJax() {
    console.log('🔄 Loading MathJax with fixed configuration...');

    // הגדרת תצורת MathJax פשוטה ויציבה
    (window as any).MathJax = {
      tex: {
        inlineMath: [['\\(', '\\)']],
        displayMath: [['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      },
      svg: {
        fontCache: 'global'
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
      },
      startup: {
        typeset: false, // אל תרנדר אוטומטית
        ready: () => {
          console.log('✅ MathJax v3 loaded successfully');
          (window as any).MathJax.startup.defaultReady();
          (window as any).MathJax.startup.promise.then(() => {
            console.log('✅ MathJax startup completed');
            // רנדור ראשוני אחרי שהכל מוכן
            setTimeout(() => {
              this.renderMathJax();
            }, 200);
          });
        }
      }
    };

    // הסרת סקריפטים ישנים
    const existingScript = document.getElementById('MathJax-script');
    if (existingScript) {
      existingScript.remove();
      console.log('🗑️ Removed existing MathJax script');
    }

    // טעינת MathJax ישירות ללא polyfill
    const mathJaxScript = document.createElement('script');
    mathJaxScript.type = 'text/javascript';
    mathJaxScript.async = true;
    mathJaxScript.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    mathJaxScript.id = 'MathJax-script';

    mathJaxScript.onload = () => {
      console.log('✅ MathJax script loaded successfully');
    };

    mathJaxScript.onerror = () => {
      console.error('❌ Failed to load MathJax script');
    };

    document.head.appendChild(mathJaxScript);
  }

  // פונקציה לרנדור MathJax משופרת עם דיאגנוסטיקה
  renderMathJax() {
    try {
      const mathJax = (window as any).MathJax;

      console.log('🔄 Starting MathJax rendering...');
      console.log('🔧 MathJax object:', !!mathJax);
      console.log('🔧 typesetPromise:', !!mathJax?.typesetPromise);
      console.log('🔧 startup.document.state:', mathJax?.startup?.document?.state);

      if (!mathJax) {
        console.error('❌ MathJax not loaded at all!');
        setTimeout(() => this.renderMathJax(), 1000);
        return;
      }

      if (!mathJax.typesetPromise) {
        console.error('❌ MathJax typesetPromise not available!');
        if (mathJax.startup && mathJax.startup.promise) {
          console.log('⏳ Waiting for MathJax startup...');
          mathJax.startup.promise.then(() => {
            console.log('✅ MathJax startup completed, retrying render...');
            setTimeout(() => this.renderMathJax(), 200);
          });
        }
        return;
      }

      // מוודא שה-DOM מוכן
      const chatElement = this.chatBox?.nativeElement;
      if (!chatElement) {
        console.warn('⚠️ Chat element not found, retrying...');
        setTimeout(() => this.renderMathJax(), 300);
        return;
      }

      // בדיקה אם יש נוסחאות לרנדר
      const latexContent = chatElement.innerHTML;
      const hasLatex = /\\\[|\\\(/.test(latexContent);

      if (!hasLatex) {
        console.log('ℹ️ No LaTeX content found to render');
        return;
      }

      console.log('🎯 Found LaTeX content, starting render...');

      // רנדור על האלמנט הספציפי
      mathJax.typesetPromise([chatElement]).then(() => {
        console.log('✅ MathJax rendered successfully');

        // בדיקה שהרנדור עבד בפועל
        setTimeout(() => {
          const mathElements = chatElement.querySelectorAll('mjx-container');
          console.log(`📊 Found ${mathElements.length} rendered math elements`);

          if (mathElements.length === 0) {
            console.warn('⚠️ No math elements were rendered! Retrying with full page...');
            mathJax.typesetPromise().catch(console.error);
          }
        }, 100);

      }).catch((err: any) => {
        console.error('❌ MathJax rendering error:', err);

        // ניסיון שני - רנדור על כל הדף
        console.log('🔄 Trying fallback render on entire page...');
        setTimeout(() => {
          mathJax.typesetPromise().then(() => {
            console.log('✅ MathJax fallback rendering succeeded');
          }).catch((fallbackErr: any) => {
            console.error('❌ MathJax fallback also failed:', fallbackErr);
          });
        }, 200);
      });

    } catch (error) {
      console.error('💥 Critical MathJax rendering error:', error);
    }
  }

  // פונקציה לכפיית עיצוב טבלאות

  forceTableStyling() {
    console.log('🎨 Auto-styling tables with advanced effects...');
    const chatElement = this.chatBox?.nativeElement;
    if (!chatElement) return;

    const allTables = chatElement.querySelectorAll('table') as NodeListOf<HTMLTableElement>;
    console.log(`🎨 Force styling ${allTables.length} tables with premium design...`);

    allTables.forEach((table, index) => {
      console.log(`🔧 Advanced styling table ${index + 1}...`);

      // 🔧 תיקון מיוחד לטבלאות עם מתמטיקה - הוספה חדשה!
      this.fixMathInTable(table);

      // הוספת classes אם חסרים
      if (!table.classList.contains('financial-table')) {
        table.classList.add('financial-table');
      }
      if (!table.classList.contains('styled-table')) {
        table.classList.add('styled-table');
      }

      // עיצוב הטבלה (שאר הקוד נשאר זהה...)
      table.style.background = 'linear-gradient(145deg, #0f1419 0%, #1a1d29 50%, #252a3d 100%)';
      table.style.borderRadius = '20px';
      table.style.margin = '30px 0';
      table.style.boxShadow = `
        0 20px 40px rgba(0, 0, 0, 0.7),
        0 0 30px rgba(100, 181, 246, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1)
      `;
      table.style.overflow = 'hidden';
      table.style.borderCollapse = 'separate';
      table.style.borderSpacing = '0';
      table.style.position = 'relative';
      table.style.width = '100%';
      table.style.fontFamily = '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';

      // עיצוב כותרות
      const headers = table.querySelectorAll('th') as NodeListOf<HTMLTableHeaderCellElement>;
      headers.forEach((th, headerIndex) => {
        const hue = 210 + (headerIndex * 15);
        th.style.background = `linear-gradient(135deg, 
          hsl(${hue}, 70%, 55%) 0%, 
          hsl(${hue + 10}, 75%, 50%) 50%,
          hsl(${hue - 10}, 65%, 45%) 100%)`;
        th.style.color = '#ffffff';
        th.style.fontWeight = '800';
        th.style.textShadow = '0 3px 6px rgba(0, 0, 0, 0.8)';
        th.style.padding = '24px 20px';
        th.style.fontSize = '17px';
        th.style.border = 'none';
        th.style.textAlign = 'center';
        th.style.letterSpacing = '0.5px';
        th.style.textTransform = 'uppercase';
        th.style.position = 'relative';
      });

      // עיצוב תאים
      const rows = table.querySelectorAll('tr') as NodeListOf<HTMLTableRowElement>;
      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return;

        const isEven = rowIndex % 2 === 0;
        row.style.background = isEven ? 'rgba(26, 26, 26, 0.8)' : 'rgba(42, 42, 42, 0.6)';
        row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        const cells = row.querySelectorAll('td') as NodeListOf<HTMLTableCellElement>;
        cells.forEach((td, cellIndex) => {
          td.style.border = '1px solid rgba(100, 181, 246, 0.2)';
          td.style.padding = '18px 16px';
          td.style.textAlign = 'center';
          td.style.position = 'relative';
          td.style.color = '#e8eaed';
          td.style.lineHeight = '1.5';
        });
      });

      // יצירת wrapper עם אפקט זוהר
      const tableWrapper = document.createElement('div');
      tableWrapper.style.position = 'relative';
      tableWrapper.style.display = 'inline-block';
      tableWrapper.style.width = '100%';
      tableWrapper.style.margin = '30px 0';

      const tableParent = table.parentElement;
      if (tableParent) {
        tableParent.insertBefore(tableWrapper, table);
        tableWrapper.appendChild(table);
        table.style.margin = '0';
      }

      console.log(`✅ Table ${index + 1} styled successfully`);
    });

    // הוספת אנימציות
    this.addTableAnimations();

    // 🔥 רנדור MathJax בטבלאות אחרי עיצוב - הוספה חדשה!
    setTimeout(() => {
      this.renderMathJaxInTables();
    }, 300);

    console.log('🎨 Advanced table styling completed with math support!');
    return allTables.length;
  }

  // 🎭 פונקציה להוספת אנימציות CSS
  private addTableAnimations() {
    const styleId = 'advanced-table-animations';

    // בדיקה אם כבר קיים
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    @keyframes borderGlow {
      0%, 100% { 
        background: linear-gradient(45deg, #64b5f6, #42a5f5, #1e88e5, #64b5f6);
        opacity: 0.6;
      }
      50% { 
        background: linear-gradient(45deg, #1e88e5, #64b5f6, #42a5f5, #1e88e5);
        opacity: 0.8;
      }
    }
    
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    .financial-table::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, 
        transparent, 
        rgba(255,255,255,0.1), 
        transparent);
      animation: shimmer 3s ease-in-out infinite;
      pointer-events: none;
    }
    
    @media (max-width: 768px) {
      .financial-table {
        font-size: 14px !important;
      }
      .financial-table th,
      .financial-table td {
        padding: 12px 8px !important;
      }
    }
  `;

    document.head.appendChild(style);
  }

  /* debugTableStyling() {
    const chatElement = this.chatBox?.nativeElement;
    if (!chatElement) return;

    const allTables = chatElement.querySelectorAll('table');
    console.log('=== TABLE STYLING DEBUG ===');
    console.log(`📊 Found ${allTables.length} tables`);

    allTables.forEach((table: Element, index: number) => {
      console.log(`\n🔍 Table ${index + 1}:`);
      console.log('  Classes:', table.className);
      console.log('  Style attribute:', table.getAttribute('style') || 'none');
      console.log('  Computed background:', getComputedStyle(table).backgroundColor);
      console.log('  HTML:', table.outerHTML.substring(0, 200) + '...');

      const rows = table.querySelectorAll('tr');
      console.log(`  Rows: ${rows.length}`);

      if (rows.length > 0) {
        const firstRowCells = rows[0].querySelectorAll('th, td');
        console.log(`  First row cells: ${firstRowCells.length}`);
      }
    });

    // תיקון עם casting נכון
    const tablesArray = Array.from(allTables) as HTMLTableElement[];

    return {
      tableCount: allTables.length,
      tablesWithStyle: tablesArray.filter(t => t.getAttribute('style')).length,
      tablesWithClass: tablesArray.filter(t => t.className).length
    };
  }  // פונקציה לכפיית רנדור במצב חירום */

  forceRenderMathJax() {
    console.log('🚨 Force rendering MathJax - Emergency mode!');

    const mathJax = (window as any).MathJax;
    if (!mathJax) {
      console.error('❌ MathJax not available for force render');
      return;
    }

    try {
      // ניסיון 1: רנדור על כל הדף
      if (mathJax.typesetPromise) {
        mathJax.typesetPromise().then(() => {
          console.log('✅ Force render successful');

          setTimeout(() => {
            const allMathElements = document.querySelectorAll('mjx-container');
            console.log(`📊 Total rendered math elements on page: ${allMathElements.length}`);
          }, 200);

        }).catch((err: any) => {
          console.error('❌ Force render failed:', err);

          // ניסיון 2: רנדור ידני
          this.manualMathJaxRender();
        });
      } else {
        this.manualMathJaxRender();
      }

    } catch (error) {
      console.error('💥 Force render critical error:', error);
    }
  }

  // רנדור ידני כ-fallback אחרון
  private manualMathJaxRender() {
    console.log('🔧 Attempting manual MathJax render...');

    const mathJax = (window as any).MathJax;
    if (mathJax && mathJax.Hub) {
      // MathJax v2 style
      mathJax.Hub.Queue(['Typeset', mathJax.Hub]);
    } else if (mathJax && mathJax.tex2svg) {
      // Manual conversion approach
      console.log('🔨 Using manual tex2svg conversion');
      this.convertLatexManually();
    } else {
      console.error('❌ No fallback render method available');
    }
  }

  // המרה ידנית של LaTeX לSVG
  private convertLatexManually() {
    const chatElement = this.chatBox?.nativeElement;
    if (!chatElement) return;

    const mathJax = (window as any).MathJax;
    if (!mathJax?.tex2svg) return;

    // מצא כל הנוסחאות display
    const displayRegex = /\\\[([\s\S]*?)\\\]/g;
    chatElement.innerHTML = chatElement.innerHTML.replace(displayRegex, (match: any, tex: any) => {
      try {
        const svg = mathJax.tex2svg(tex, { display: true });
        return svg.outerHTML;
      } catch (err) {
        console.error('Error converting display math:', tex, err);
        return match;
      }
    });

    // מצא כל הנוסחאות inline
    const inlineRegex = /\\\((.*?)\\\)/g;
    chatElement.innerHTML = chatElement.innerHTML.replace(inlineRegex, (match: any, tex: any) => {
      try {
        const svg = mathJax.tex2svg(tex, { display: false });
        return svg.outerHTML;
      } catch (err) {
        console.error('Error converting inline math:', tex, err);
        return match;
      }
    });

    console.log('✅ Manual conversion completed');
  }

  // פונקציה לעיבוד תוכן HTML מורכב - משופרת עם inline styles
  private processAdvancedHtml(html: string): string {
    // תיקון טבלאות עם inline styles - הוספת class + inline styles
    html = html.replace(/<table([^>]*style[^>]*)>/gi, (match, attributes) => {
      return `<table${attributes} class="financial-table styled-table" style="background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%) !important; border: 2px solid #64b5f6 !important; border-radius: 15px !important;">`;
    });

    // הוספת classes + inline styles לכל הטבלאות
    html = html.replace(/<table([^>]*)>/gi, (match, attributes) => {
      if (!attributes.includes('style=')) {
        return `<table${attributes} class="financial-table styled-table" style="background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%) !important; border: 2px solid #64b5f6 !important; border-radius: 15px !important; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5) !important; margin: 25px 0 !important; border-collapse: collapse !important; overflow: hidden !important;">`;
      }
      return match;
    });

    // עיצוב כותרות טבלה
    html = html.replace(/<th([^>]*)>/gi, (match, attributes) => {
      return `<th${attributes} style="background: linear-gradient(135deg, #64b5f6 0%, #42a5f5 100%) !important; color: white !important; font-weight: 700 !important; padding: 20px 15px !important; text-align: center !important; border: none !important;">`;
    });

    // עיצוב תאי טבלה
    html = html.replace(/<td([^>]*)>/gi, (match, attributes) => {
      return `<td${attributes} style="background: rgba(26, 26, 26, 0.95) !important; color: #e0e0e0 !important; border: 1px solid rgba(100, 181, 246, 0.4) !important; padding: 16px !important; text-align: center !important;">`;
    });

    // תיקון תאי טבלה עם מספרים - זיהוי מתקדם
    html = html.replace(/<td([^>]*)style="([^"]*)"([^>]*)>([^<]*[₪%\d,]+.*?)<\/td>/gi, (match, beforeStyle, style, afterStyle, content) => {
      const enhancedStyle = style + '; font-family: Monaco, Consolas, monospace !important; color: #ffcc80 !important; font-weight: 600 !important;';
      return `<td${beforeStyle}style="${enhancedStyle}"${afterStyle} class="numeric-cell">${content}</td>`;
    });

    // הוספת wrapper לגרפים
    html = html.replace(/<div([^>]*chart[^>]*)>/gi, (match, attributes) => {
      return `<div${attributes} class="chart-container">`;
    });

    // תיקון canvas elements
    html = html.replace(/<canvas([^>]*)>/gi, (match, attributes) => {
      return `<canvas${attributes} class="financial-chart">`;
    });

    return html;
  }


  /**
   * פונקציה לולידציה ותיקון סוגריים (גרסה מתוקנת)
   */
  private validateAndFixBraces(content: string): string {
    let openCount = 0;
    let closeCount = 0;

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        openCount++;
      } else if (content[i] === '}') {
        closeCount++;
      }
    }

    console.log(`🔍 ולידציה: סוגריים פותחים=${openCount}, סוגריים סוגרים=${closeCount}`);

    let fixed = content;

    if (openCount > closeCount) {
      const missing = openCount - closeCount;
      fixed = content + '}'.repeat(missing); // תיקון: הוסרתי את הנקודות הנוספות
      console.log(`🔧 הוספתי ${missing} סוגריים סוגרים`);
    } else if (closeCount > openCount) {
      const excess = closeCount - openCount;
      console.log(`⚠️ יש ${excess} סוגריים סוגרים מיותרים`);
    }

    return fixed;
  }

  /**
   * פונקציה מעודכנת לפיצול נוסחאות ארוכות
   */
  private optimizeFormulaDisplay(content: string): string {
    // אם הנוסחה ארוכה מדי, נפצל אותה
    if (content.length > 80) {
      console.log(`📏 נוסחה ארוכה (${content.length} תווים), מפצל לתצוגה טובה יותר`);

      // נמצא את כל הפלוסים ונבחר את המתאים ביותר
      const plusPositions: number[] = [];
      for (let i = 0; i < content.length - 3; i++) {
        if (content.substring(i, i + 3) === ' + ') {
          plusPositions.push(i);
        }
      }

      // נמצא פלוס שמאפשר פיצול מאוזן (לא קרוב מדי להתחלה או לסוף)
      for (const plusIndex of plusPositions) {
        if (plusIndex > 30 && plusIndex < content.length - 30) {
          const before = content.substring(0, plusIndex);
          const after = content.substring(plusIndex + 3);

          console.log(`✂️ פוצלתי במקום פלוס אופטימלי (מיקום ${plusIndex})`);
          console.log(`📝 חלק ראשון: ${before.length} תווים`);
          console.log(`📝 חלק שני: ${after.length} תווים`);

          const formattedContent = `${before} \\\\[8pt] \\quad + ${after}`;
          return formattedContent;
        }
      }

      // אם לא מצאנו פלוס מתאים, ננסה עם שווה
      const equalsIndex = content.indexOf(' = ');
      if (equalsIndex > 10 && equalsIndex < content.length - 50) {
        const before = content.substring(0, equalsIndex);
        const after = content.substring(equalsIndex + 3);
        console.log(`✂️ פוצלתי אחרי סימן השווה`);
        const formattedContent = `${before} \\\\[8pt] = ${after}`;
        return formattedContent;
      }

      // כפתרון אחרון, נפצל באמצע הנוסחה
      if (content.length > 120) {
        const midPoint = Math.floor(content.length / 2);
        // נחפש רווח קרוב לאמצע
        let splitPoint = midPoint;
        for (let i = midPoint - 10; i <= midPoint + 10; i++) {
          if (content[i] === ' ' && content[i + 1] !== '+' && content[i + 1] !== '-') {
            splitPoint = i;
            break;
          }
        }

        const before = content.substring(0, splitPoint);
        const after = content.substring(splitPoint + 1);
        console.log(`✂️ פיצול חירום באמצע הנוסחה`);
        const formattedContent = `${before} \\\\[8pt] \\quad ${after}`;
        return formattedContent;
      }
    }

    return content;
  }

  /**
   * 🎯 תיקון מהיר לבעיות underscore הספציפיות שלך
   */
  private quickFixUnderscoreIssues(content: string): string {
    let fixed = content;

    console.log(`🔧 בודק underscore issues בתוכן: "${content.substring(0, 30)}..."`);

    // בדיקה אם יש בעיות אמיתיות עם backslash underscore
    const hasBackslashUnderscore = /\\\_/.test(content);
    
    if (!hasBackslashUnderscore) {
      console.log(`✅ אין בעיות backslash underscore - מדלג על תיקונים`);
      return content;
    }

    console.log(`⚠️ נמצאו בעיות backslash underscore - מתקן...`);

    // רשימת תיקונים ספציפיים רק לבעיות אמיתיות עם backslash
    const criticalFixes = [
      // הבעיה הראשית: monthly\_initial
      {
        from: /monthly\\\_initial/g,
        to: 'monthly,initial',
        description: 'תיקון monthly_initial'
      },

      // הבעיה השנייה: annual\_initial  
      {
        from: /annual\\\_initial/g,
        to: 'annual,initial',
        description: 'תיקון annual_initial'
      },

      // תיקון כללי רק למקרים בעייתיים עם backslash underscore
      {
        from: /([a-zA-Z]+)\\\_([a-zA-Z]+)/g,
        to: '$1,$2',
        description: 'תיקון כללי backslash underscore'
      },

      // תיקון בתוך subscripts רק אם יש בעיה עם backslash
      {
        from: /_{([^}]*?)\\\_([^}]*?)}/g,
        to: '_{$1,$2}',
        description: 'תיקון underscore בתוך subscripts'
      },

      // תיקון למקרים מורכבים יותר
      {
        from: /FV_{monthly\\\_initial}/g,
        to: 'FV_{mi}',
        description: 'תיקון FV monthly initial'
      },

      {
        from: /FV_{annual\\\_initial}/g,
        to: 'FV_{ai}',
        description: 'תיקון FV annual initial'
      }
    ];

    // החלת התיקונים רק אם יש בעיות backslash underscore
    criticalFixes.forEach(fix => {
      const before = fixed;
      fixed = fixed.replace(fix.from, fix.to);

      if (before !== fixed) {
        console.log(`✅ ${fix.description}: בוצע`);
      }
    });

    return fixed;
  }

  /**
   * 🔧 עדכון לפונקציה cleanMathContentAdvanced - גרסה מתוקנת
   */
  private cleanMathContentAdvanced(content: string): string {
    let cleaned = content.trim();

    console.log(`🔧 מתחיל ניקוי מתקדם: "${cleaned.substring(0, 50)}..."`);

    // 🎯 שלב קריטי: תיקון בעיות underscore לפני הכל
    cleaned = this.quickFixUnderscoreIssues(cleaned);
    console.log(`🔧 אחרי תיקון underscore: "${cleaned.substring(0, 50)}..."`);

    // ולידציה ותיקון ראשוני של סוגריים
    cleaned = this.validateAndFixBraces(cleaned);

    // אופטימיזציה לתצוגה של נוסחאות ארוכות
    cleaned = this.optimizeFormulaDisplay(cleaned);

    // הסרת רווחים מיותרים אבל שמירה על רווחים חשובים
    cleaned = cleaned.replace(/\s+/g, ' ');

    // רשימת פקודות LaTeX שצריכות backslash
    const mathCommands = [
      'frac', 'sqrt', 'sum', 'int', 'times', 'cdot', 'approx', 'infty',
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'pi', 'sigma', 'theta',
      'lambda', 'mu', 'nu', 'omega', 'Omega', 'leq', 'geq', 'neq', 'pm', 'mp',
      'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf',
      'text', 'quad', 'qquad'
    ];

    // הוספת backslashes חסרים
    mathCommands.forEach(cmd => {
      const regex = new RegExp(`(?<!\\\\)\\b${cmd}\\b`, 'g');
      cleaned = cleaned.replace(regex, `\\${cmd}`);
    });

    // תיקון פסיקים במספרים
    cleaned = cleaned.replace(/(\d),(\d)/g, '$1{,}$2');

    // תיקון חזקות ותחתיות - רק אם הם לא כבר בסוגריים
    cleaned = cleaned.replace(/\^([a-zA-Z0-9]+)(?![}])/g, '^{$1}');
    cleaned = cleaned.replace(/_([a-zA-Z0-9א-ת]+)(?![}])/g, '_{$1}');

    // תיקון סוגריים מסולסלים כפולים
    cleaned = cleaned.replace(/\{\{/g, '{');
    cleaned = cleaned.replace(/\}\}/g, '}');

    // הסרת רווחים סביב backslashes
    cleaned = cleaned.replace(/\s*\\\s*/g, '\\');

    console.log(`✨ תוצאה סופית: "${cleaned.substring(0, 50)}..."`);

    // ולידציה סופית
    const finalOpenCount = (cleaned.match(/\{/g) || []).length;
    const finalCloseCount = (cleaned.match(/\}/g) || []).length;

    if (finalOpenCount !== finalCloseCount) {
      console.warn(`⚠️ אחרי ניקוי עדיין יש חוסר איזון בסוגריים: ${finalOpenCount} פותחים, ${finalCloseCount} סוגרים`);
    } else {
      console.log(`✅ סוגריים מאוזנים אחרי ניקוי מתקדם`);
    }

    return cleaned;
  }

  // 🔧 פונקציה חדשה לתיקון מתמטיקה בטבלאות
  private fixMathInTable(table: HTMLTableElement) {
    console.log('🔧 מתקן מתמטיקה בטבלה...');
    
    const allCells = table.querySelectorAll('td, th');
    
    allCells.forEach((cell, index) => {
      const innerHTML = cell.innerHTML;
      
      // בדיקה אם יש MATHI או MATHD בתא
      if (innerHTML.includes('MATHI{') || innerHTML.includes('MATHD{')) {
        console.log(`🔧 נמצאה מתמטיקה בתא ${index}: ${innerHTML.substring(0, 50)}...`);
        
        // עיבוד המתמטיקה באותו אופן כמו ברגיל
        this.processMathInCell(cell);
      }
    });
  }

  // 🔧 פונקציה לעיבוד מתמטיקה בתא ספציפי
  private async processMathInCell(cell: Element) {
    try {
      const originalHTML = cell.innerHTML;
      console.log(`🔧 מעבד מתמטיקה בתא: ${originalHTML}`);
      
      // שימוש באותה פונקציה שמעבדת מתמטיקה
      const processedHTML = await this.safeMarkedWithMath(originalHTML);
      
      cell.innerHTML = processedHTML;
      console.log(`✅ מתמטיקה בתא עובדה: ${processedHTML.substring(0, 50)}...`);
      
    } catch (error) {
      console.error('❌ שגיאה בעיבוד מתמטיקה בתא:', error);
    }
  }

  // 🔥 פונקציה חדשה לרנדור MathJax בטבלאות
  private renderMathJaxInTables() {
    console.log('🔥 רנדור MathJax בטבלאות...');
    
    const mathJax = (window as any).MathJax;
    if (!mathJax || !mathJax.typesetPromise) {
      console.warn('⚠️ MathJax לא זמין לרנדור בטבלאות');
      return;
    }

    const chatElement = this.chatBox?.nativeElement;
    if (!chatElement) return;

    const tables = chatElement.querySelectorAll('table');
    
    tables.forEach((table: { querySelectorAll: (arg0: string) => any; }, index: number) => {
      console.log(`🔥 רנדור MathJax בטבלה ${index + 1}...`);
      
      // רנדור MathJax על הטבלה הספציפית
      mathJax.typesetPromise([table]).then(() => {
        console.log(`✅ MathJax רונדר בטבלה ${index + 1}`);
        
        // בדיקה שהרנדור עבד
        const mathElements = table.querySelectorAll('mjx-container');
        console.log(`📊 נמצאו ${mathElements.length} אלמנטי math בטבלה ${index + 1}`);
        
      }).catch((err: any) => {
        console.error(`❌ שגיאה ברנדור MathJax בטבלה ${index + 1}:`, err);
      });
    });
  }


  /**
   * הפונקציה החשובה ביותר - זו שמוצאת ומעבדת את המתמטיקה
   */
  private parseMathBlocks(text: string): { parsedText: string, mathMap: Map<string, string> } {
    const mathMap = new Map<string, string>();
    let counter = 0;
    let parsedText = text;

    // פונקציה עזר למציאת סוגר סוגר מתאים
    const findMatchingBrace = (text: string, startPos: number): number => {
      let braceCount = 0;
      for (let i = startPos; i < text.length; i++) {
        if (text[i] === '{') {
          braceCount++;
        } else if (text[i] === '}') {
          if (braceCount === 0) {
            return i;
          }
          braceCount--;
        }
      }
      return -1;
    };

    // עיבוד MATHD blocks עם ולידציה
    console.log('🔢 מעבד MATHD blocks עם ולידציה...');
    let startPos = 0;
    while (true) {
      const mathStart = parsedText.indexOf('MATHD{', startPos);
      if (mathStart === -1) break;

      const contentStart = mathStart + 6;
      const braceEnd = findMatchingBrace(parsedText, contentStart);

      if (braceEnd === -1) {
        console.warn(`⚠️ לא נמצא סוגר סוגר מתאים ב-MATHD החל מ-${mathStart}`);
        startPos = mathStart + 1;
        continue;
      }

      const afterBrace = braceEnd + 1;
      if (!parsedText.startsWith('MATHD', afterBrace)) {
        startPos = mathStart + 1;
        continue;
      }

      const mathEnd = afterBrace + 5;
      const fullMatch = parsedText.substring(mathStart, mathEnd);
      const content = parsedText.substring(contentStart, braceEnd);

      const token = `@@LATEX_DISPLAY_${counter++}@@`;
      const cleanContent = this.cleanMathContentAdvanced(content);
      const latex = `\\[${cleanContent}\\]`;

      console.log(`📝 נמצא MATHD: "${fullMatch.substring(0, 50)}..."`);
      console.log(`📄 תוכן: "${content.substring(0, 50)}..."`);
      console.log(`✨ LaTeX: "${latex.substring(0, 50)}..."`);

      mathMap.set(token, latex);
      parsedText = parsedText.substring(0, mathStart) + token + parsedText.substring(mathEnd);

      startPos = mathStart + token.length;
    }

    // עיבוד MATHI blocks
    console.log('🔢 מעבד MATHI blocks...');
    startPos = 0;
    while (true) {
      const mathStart = parsedText.indexOf('MATHI{', startPos);
      if (mathStart === -1) break;

      const contentStart = mathStart + 6;
      const braceEnd = findMatchingBrace(parsedText, contentStart);

      if (braceEnd === -1) {
        console.warn(`⚠️ לא נמצא סוגר סוגר מתאים ב-MATHI החל מ-${mathStart}`);
        startPos = mathStart + 1;
        continue;
      }

      const afterBrace = braceEnd + 1;
      if (!parsedText.startsWith('MATHI', afterBrace)) {
        startPos = mathStart + 1;
        continue;
      }

      const mathEnd = afterBrace + 5;
      const content = parsedText.substring(contentStart, braceEnd);

      const token = `@@LATEX_INLINE_${counter++}@@`;
      const cleanContent = this.cleanMathContentAdvanced(content);
      const latex = `\\(${cleanContent}\\)`;

      console.log(`📝 נמצא MATHI: "${content}" -> ${token}`);

      mathMap.set(token, latex);
      parsedText = parsedText.substring(0, mathStart) + token + parsedText.substring(mathEnd);

      startPos = mathStart + token.length;
    }

    return { parsedText, mathMap };
  }

  /**
   * הפונקציה המעודכנת עם parser פשוט וחכם (החלף את safeMarkedWithMath הקיימת)
   */
  async safeMarkedWithMath(markdown: string): Promise<string> {
    console.log('🚀 מתחיל עיבוד עם parser פשוט וחכם...');

    let counter = 100; // נתחיל מ-100 כדי לא להתנגש
    const htmlMap = new Map<string, string>();

    // --- שמירת HTML blocks תחילה ---
    markdown = markdown.replace(/```html\s*([\s\S]*?)\s*```/g, (match, htmlContent) => {
      const token = `@@HTML_BLOCK_${counter++}@@`;
      htmlMap.set(token, htmlContent.trim());
      return token;
    });

    markdown = markdown.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
      const token = `@@HTML_TABLE_${counter++}@@`;
      htmlMap.set(token, match);
      return token;
    });

    markdown = markdown.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
      const token = `@@HTML_SCRIPT_${counter++}@@`;
      htmlMap.set(token, match);
      return token;
    });

    markdown = markdown.replace(/<div[^>]*>[\s\S]*?<\/div>/gi, (match) => {
      if (match.includes('Chart') || match.includes('canvas') || match.includes('chart')) {
        const token = `@@HTML_CHART_${counter++}@@`;
        htmlMap.set(token, match);
        return token;
      }
      return match;
    });

    // --- עיבוד Math עם parser חכם ---
    const { parsedText, mathMap } = this.parseMathBlocks(markdown);
    markdown = parsedText;

    // --- המרת Markdown ל-HTML ---
    let html = await marked(markdown, {
      gfm: true,
      breaks: true
    });

    // --- החזרת Math ---
    console.log('🔄 מחזיר Math tokens...');
    mathMap.forEach((latex, token) => {
      html = html.replace(new RegExp(this.escapeRegExp(token), 'g'), latex);
    });

    // --- החזרת HTML blocks ---
    console.log('🔄 מחזיר HTML tokens...');
    htmlMap.forEach((block, token) => {
      html = html.replace(new RegExp(this.escapeRegExp(token), 'g'), block);
    });

    // --- שיפורים קיימים ---
    html = html.replace(/<table>/g, '<table class="responsive-table">');
    html = html.replace(/<li>/g, '<li class="enhanced-li">');

    html = this.processAdvancedHtml(html);

    // --- בדיקת טוקנים שנותרו ---
    const remainingTokens = html.match(/@@(LATEX_|HTML_)[^@]*@@/g);
    if (remainingTokens) {
      console.error('❌ טוקנים שלא הוחזרו:', remainingTokens);
    } else {
      console.log('✅ כל הטוקנים הוחזרו בהצלחה - Parser חכם עובד!');
    }

    return html;
  }

  // עוזר להימנע משגיאות RegExp
  private escapeRegExp(text: string): string {
    return text.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
  }


  private async ensureChartJsLoaded(): Promise<void> {
  if (!(window as any).Chart) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => resolve();
      script.onerror = (error: Event | string) => {
        const errorMessage = typeof error === 'string' ? error : 'Failed to load Chart.js';
        reject(new Error(`❌ ${errorMessage}`));
      };
      document.head.appendChild(script);
    });
  }
}


  async sendMessage() {
    const message = this.userInput.trim();
    if (!message || this.loading) return;

    // בדיקה אם זו ההודעה הראשונה
    const isFirstMessage = this.messages.filter(msg => msg.sender === 'user').length === 0;

    const enhancedMessage = isFirstMessage 
      ? message + `

    בתשובתך, יש לשים דגש על ההנחיות בנושא כתיבת קטע קוד ה SCRIPT`
      : message;
      
    const userMessage: Message = {
      sender: 'user',
      message: enhancedMessage,
      timestamp: new Date(),
      id: this.generateMessageId()
    };

    this.conversation.push(userMessage);
    this.userInput = '';
    this.loading = true;
    this.scrollToBottom();

    try {
      const response = await lastValueFrom(this.http.post<any>(`${this.apiUrl}/api/chat`, {
        sessionId: this.sessionId,
        message,
        timestamp: new Date().toISOString()
      }));

      const rawMarkdown = response?.markdown ?? response?.message ?? 'מצטער, לא הצלחתי לקבל תשובה מהשרת.';
      const processedHtml = await this.safeMarkedWithMath(rawMarkdown);

      // שליחה לניהול אחיד של הודעת AI
      const id = this.generateMessageId();
      const timestamp = new Date();
      await this.handleResponse(processedHtml, id, timestamp);

      // עדכון מטאדטה של מומחים בהודעה האחרונה
      if (response?.agents_used?.length > 0 && response?.sections) {
        const lastMsg = this.conversation[this.conversation.length - 1];
        if (lastMsg && lastMsg.sender === 'ai') {
          lastMsg.agentsUsed = response.sections;
          lastMsg.mode = response.mode;
        }
      }

      //this.saveConversationToStorage();
      this.saveConversationManually();
      this.cdr.detectChanges();

      // וודא שהתוכן הוכנס ל-DOM לפני רנדור MathJax וגלילה
      setTimeout(() => {
        this.scrollToBottom();
      }, 50);

    } catch (error) {
      console.error('Chat error:', error);

      await this.handleResponse(
        `
        <div style="text-align: center; color: #ff6b6b; padding: 15px;">
          <h3>⚠️ שגיאה בחיבור לשרת</h3>
          <p>מצטער, לא הצלחתי לקבל תשובה כרגע. אנא נסה שוב בעוד רגע.</p>
          <small>שגיאה טכנית: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}</small>
        </div>
      `,
        this.generateMessageId(),
        new Date()
      );
    } finally {
      this.loading = false;
      this.focusInput();
    }
  }

  // 3. הוסף לComponent - פונקציות עזר שחסרות:
  getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      'ניתוח פנסיוני': '🏦',
      'ניתוח משכנתא והשוואת מסלולים': '🏠',
      'ניתוח הלוואה': '💰',
      'ניתוח תקציב אישי': '📊',
      'חישוב חיסכון והשקעות': '💎',
      'השוואת קנייה מול שכירות': '🔄',
      'תכנון פיננסי למשפחה וילדים': '👨‍👩‍👧‍👦',
      'ניתוח פיננסי כללי': '📈',
      'מתמטיקה ופיננסים': '🧮',
      'תרשימים וגרפיקה': '📊',
      'תכנות': '💻'
    };

    console.log('🎯 getCategoryIcon called for:', category);
    return icons[category] || '📋';
  }

  /*  getCategoryIcon(category: string): string {
     return this.conversationService.getCategoryIcon(category);
   }
  */
  formatTimeAgo(date: Date | string): string {
    return this.conversationService.formatTimeAgo(date);
  }

  // 🔥 הוסף את הפונקציה הזו ל-app.component.ts

  // פונקציה לקבלת סטטיסטיקות ביצועים מהשרת
  async getServerPerformanceStats() {
    try {
      console.log('📊 Fetching server performance stats...');

      const response = await this.http.get<any>(`${this.apiUrl}/api/performance`).toPromise();

      console.log('✅ Performance stats received:', response);

      // הצגת הסטטיסטיקות בממשק
      const statsMessage: Message = {
        sender: 'ai',
        message: this.formatPerformanceStats(response.performance),
        timestamp: new Date(),
        id: this.generateMessageId()
      };

      this.conversation.push(statsMessage);
      //this.saveConversationToStorage();
      this.cdr.detectChanges();
      this.scrollToBottom();

    } catch (error) {
      console.error('❌ Error fetching performance stats:', error);

      const errorMessage: Message = {
        sender: 'ai',
        message: `
        <div style="color: #ff6b6b; text-align: center; padding: 15px;">
          <h3>⚠️ שגיאה בקבלת סטטיסטיקות</h3>
          <p>לא הצלחתי לקבל סטטיסטיקות מהשרת.</p>
          <small>שגיאה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}</small>
        </div>
      `,
        timestamp: new Date(),
        id: this.generateMessageId()
      };

      this.conversation.push(errorMessage);
      //this.saveConversationToStorage();
      this.cdr.detectChanges();
    }
  }

  // פונקציה לעיצוב הסטטיסטיקות ל-HTML יפה
  private formatPerformanceStats(stats: any): string {
    const uptime = this.formatUptime(stats.server.uptime);

    return `
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
                padding: 25px; border-radius: 15px; margin: 20px 0;
                border: 2px solid #64b5f6; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
      
      <h2 style="text-align: center; color: #64b5f6; margin-bottom: 25px;">
        📊 סטטיסטיקות ביצועים של השרת
      </h2>

      <!-- Server Info -->
      <div style="background: rgba(42, 42, 42, 0.8); padding: 15px; 
                  border-radius: 10px; margin-bottom: 20px;">
        <h3 style="color: #26c6da; margin-bottom: 10px;">🖥️ מידע שרת</h3>
        <table class="financial-table" style="background: transparent; border: none; margin: 0;">
          <tr>
            <td style="font-weight: bold; width: 40%;">התחיל בזמן:</td>
            <td style="color: #ffcc80; font-family: monospace; direction: ltr;">${stats.server.startTime}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">זמן פעילות:</td>
            <td style="color: #ffcc80; font-family: monospace;">${uptime}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">פלטפורמה:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.server.platform}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">גרסת Node.js:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.server.nodeVersion}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Process ID:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.server.pid}</td>
          </tr>
        </table>
      </div>

      <!-- Sessions Info -->
      <div style="background: rgba(42, 42, 42, 0.8); padding: 15px; 
                  border-radius: 10px; margin-bottom: 20px;">
        <h3 style="color: #26c6da; margin-bottom: 10px;">🔗 מידע Sessions</h3>
        <table class="financial-table" style="background: transparent; border: none; margin: 0;">
          <tr>
            <td style="font-weight: bold; width: 40%;">Sessions פעילים:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.sessions.active}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">אורך היסטוריה ממוצע:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.sessions.averageHistoryLength} הודעות</td>
          </tr>
        </table>
      </div>

      <!-- Memory Info -->
      <div style="background: rgba(42, 42, 42, 0.8); padding: 15px; 
                  border-radius: 10px; margin-bottom: 20px;">
        <h3 style="color: #26c6da; margin-bottom: 10px;">💾 שימוש בזיכרון</h3>
        <table class="financial-table" style="background: transparent; border: none; margin: 0;">
          <tr>
            <td style="font-weight: bold; width: 40%;">זיכרון כולל (RSS):</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.memory.rss}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Heap בשימוש:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.memory.heapUsed}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Heap כולל:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.memory.heapTotal}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">External:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.memory.external}</td>
          </tr>
        </table>
      </div>

      <!-- Optimization Info -->
      <div style="background: rgba(42, 42, 42, 0.8); padding: 15px; 
                  border-radius: 10px;">
        <h3 style="color: #26c6da; margin-bottom: 10px;">⚡ הגדרות אופטימיזציה</h3>
        <table class="financial-table" style="background: transparent; border: none; margin: 0;">
          <tr>
            <td style="font-weight: bold; width: 40%;">מודל AI:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.optimization.modelUsed}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">מקסימום Sessions:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.optimization.maxSessionsLimit}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">הגבלת היסטוריה:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.optimization.historyLimitPerSession} הודעות</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">ניקוי אוטומטי:</td>
            <td style="color: #ffcc80; font-family: monospace;">${stats.optimization.sessionCleanupInterval}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
        📅 דו"ח נוצר: ${new Date().toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Jerusalem'
    })}
      </div>
    </div>
  `;
  }

  // פונקציה עוזרת לעיצוב זמן פעילות
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let result = '';
    if (days > 0) result += `${days} ימים, `;
    if (hours > 0) result += `${hours} שעות, `;
    if (minutes > 0) result += `${minutes} דקות, `;
    result += `${secs} שניות`;

    return result;
  }

  private addWelcomeMessage() {
    if (this.conversation.length === 0) {
      console.log('Start new conversation');
      const welcomeMessage: Message = {
        sender: 'ai',
        message: `
          <div style="text-align: center; padding: 20px;">
            <h2>🎉 ברוכים הבאים ליועץ הפיננסי החכם!</h2>
            <p>אני כאן לעזור לכם עם שאלות פיננסיות, השקעות, תקציב ועוד.</p>
            <div style="background: linear-gradient(135deg, rgba(25, 118, 210, 0.1), rgba(38, 198, 218, 0.1)); 
                        padding: 15px; border-radius: 10px; margin-top: 15px;">
              <strong>דוגמאות לשאלות:</strong><br>
              💰 איך לתכנן תקציב חודשי?<br>
              📈 מה עדיף - השקעה בקרנות או במניות?<br>
              🏠 כמה כדאי לחסוך למשכנתא?<br>
              💳 איך לנהל חובות בחכמה?
            </div>
          </div>
        `,
        timestamp: new Date(),
        id: this.generateMessageId()
      };
      this.conversation.push(welcomeMessage);
      //this.saveConversationToStorage();
    }
  }

  private generateMessageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /* private loadConversationFromStorage() {
    try {
      const saved = localStorage.getItem(`financial_chat_${this.sessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.conversation = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));

        // עיצוב טבלאות אוטומטי אחרי שהתוכן נטען
        setTimeout(() => {
          this.forceTableStyling();
        }, 500);

        setTimeout(() => {
          this.forceRenderMathJax();
        }, 500);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  } */

  /* private saveConversationToStorage() {
    try {
      localStorage.setItem(`financial_chat_${this.sessionId}`, JSON.stringify(this.conversation));
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  } */

  private focusInput() {
    setTimeout(() => {
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.focus();
      }
    }, 100);
  }

  scrollToBottom() {
    setTimeout(() => {
      const el = this.chatBox?.nativeElement;
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);
  }

  onTyping() {
    this.isTyping = true;

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.isTyping = false;
    }, 1000);
  }

  clearConversation() {
    if (confirm('האם אתה בטוח שברצונך למחוק את כל השיחה?')) {
      this.conversation = [];
      localStorage.removeItem(`financial_chat_${this.sessionId}`);
      this.addWelcomeMessage();
    }
  }

  safeHtmlToString(safe: SafeHtml): string {
    const div = document.createElement('div');
    div.innerHTML = safe as string;
    return div.innerText || '';
  }

  exportConversation() {
    const exportData = {
      sessionId: this.sessionId,
      exportDate: new Date().toISOString(),
      messages: this.conversation.map(msg => ({
        sender: msg.sender,
        message: msg.sender === 'ai'
          ? this.stripHtml(this.safeHtmlToString(msg.message))
          : msg.message,
        timestamp: msg.timestamp.toISOString()
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial_chat_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private stripHtml(input: SafeHtml | string): string {
    const html = typeof input === 'string' ? input : String(input);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  downloadHTML() {
    const container = document.documentElement.outerHTML;

    const blob = new Blob([container], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-financial-advisor_${new Date().toISOString()}.html`;
    a.click();

    URL.revokeObjectURL(url);
  }


  async downloadPDF() {
    const element = this.chatBox?.nativeElement;
    if (!element) {
      console.error('❌ לא נמצא האלמנט chatBox לייצוא');
      return;
    }

    // לוודא שהגרפים וה-MathJax רונדרו קודם
    try {
      await this.ensureChartJsLoaded();
      if ((window as any).MathJax?.typesetPromise) {
        await (window as any).MathJax.typesetPromise([element]);
      }
    } catch (err) {
      console.warn('⚠️ בעיה ברינדור לפני יצירת PDF:', err);
    }

    const html2pdf = await import('html2pdf.js');

    // הגדרות משופרות
    const opt = {
      margin: [0.4, 0.2, 0.6, 0.2], // [top, left, bottom, right]
      filename: `דוח_פיננסי_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        backgroundColor: '#0f0f23', // רקע מוצק במקום שקוף
        logging: true,
        scrollY: 0 // למנוע חיתוך בגלילה
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // הפקת PDF
    html2pdf.default().from(element).set(opt).save();
  }

  /* downloadPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('דו"ח שיחה עם יועץ פיננסי מבוסס AI', 105, 10, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    this.conversation.forEach((msg, index) => {
      const time = new Date().toLocaleString('he-IL');
      const sender = msg.sender === 'user' ? 'משתמש' : 'יועץ AI';
      const content = msg.sender === 'ai'
        ? this.stripHtml(msg.message)
        : msg.message as string;

      const line = `[${time}] ${sender}: ${content}`;
      const splitText = doc.splitTextToSize(line, 180);
      doc.text(splitText, 10, y);
      y += splitText.length * 7;

      if (y > 270 && index < this.conversation.length - 1) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`financial_chat_${new Date().toISOString().split('T')[0]}.pdf`);
  } */

  getMessageTime(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דקות`;
    if (diffMins < 1440) return `לפני ${Math.floor(diffMins / 60)} שעות`;
    return timestamp.toLocaleDateString('he-IL');
  }

  autoGrow(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto'; // איפוס גובה קודם
    textarea.style.height = textarea.scrollHeight + 'px'; // גובה לפי תוכן
  }


  handleEnterKey(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.sendMessage();
    }
  }

  addQuickMessage(message: string) {
    this.userInput = message;
    this.focusInput();
  }

  getQuickMessages(): string[] {
    return [
      'איך לתכנן תקציב חודשי?',
      'מה עדיף - השקעה בקרנות או במניות?',
      'כמה כדאי לחסוך למשכנתא?',
      'איך לנהל חובות בחכמה?',
      'מה זה ריבית דריבית?',
      'איך לבחור קרן פנסיה?'
    ];
  }

  // פונקציה לבדיקת סטטוס MathJax
  checkMathJaxStatus() {
    const mathJax = (window as any).MathJax;
    const status = {
      loaded: !!mathJax,
      version: mathJax?.version || 'unknown',
      typesetPromise: !!mathJax?.typesetPromise,
      tex: !!mathJax?.tex,
      startup: !!mathJax?.startup,
      ready: mathJax?.startup?.document?.state >= 8,
      scriptsInHead: {
        polyfill: !!document.getElementById('MathJax-polyfill'),
        mathJax: !!document.getElementById('MathJax-script')
      }
    };

    console.log('🔧 MathJax Status Report:');
    console.table(status);

    if (!status.loaded) {
      console.warn('⚠️ MathJax not loaded! Trying to reload...');
      this.reloadMathJax();
    } else if (!status.ready) {
      console.warn('⚠️ MathJax loaded but not ready! Current state:', mathJax?.startup?.document?.state);
    } else {
      console.log('✅ MathJax is fully loaded and ready!');
    }

    return status;
  }

  // פונקציה לטעינה מחדש של MathJax
  reloadMathJax() {
    console.log('🔄 Reloading MathJax...');

    // הסרת סקריפטים קיימים
    const existingPolyfill = document.getElementById('MathJax-polyfill');
    const existingScript = document.getElementById('MathJax-script');

    if (existingPolyfill) existingPolyfill.remove();
    if (existingScript) existingScript.remove();

    // איפוס המשתנה הגלובלי
    delete (window as any).MathJax;

    // טעינה מחדש
    setTimeout(() => {
      this.loadMathJax();
    }, 100);
  }

  // פונקציה לטסט רנדור LaTeX - משופרת
  /* testLatexRendering() {
    console.log('🧪 Starting LaTeX rendering test...');

    const testMessage: Message = {
      sender: 'ai',
      message: `
        <h3>🧪 בדיקת רנדור LaTeX</h3>
        <p><strong>נוסחה inline:</strong> \\(x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\)</p>
        <p><strong>נוסחה display:</strong></p>
        \\[E = mc^2\\]
        <p><strong>נוסחה מורכבת:</strong></p>
        \\[\\sum_{i=1}^{n} x_i = \\frac{1}{n}\\sum_{i=1}^{n} y_i\\]
        <p><strong>נוסחה פיננסית:</strong></p>
        \\[FV = PV \\times (1 + r)^n\\]
        <p><strong>נוסחאות עם דולרים:</strong></p>
        <p>ריבית חודשית: \\(r = \\frac{0.07}{12} = 0.00583\\)</p>
        <p>מחיר: $850,000 (זה לא נוסחה, אלא מחיר)</p>
        <div style="background: rgba(100, 181, 246, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
          <strong>✅ אם אתה רואה נוסחאות מעוצבות למעלה - MathJax עובד!</strong><br>
          <strong>❌ אם אתה רואה רק טקסט עם סלאשים - יש בעיה ברנדור</strong>
        </div>
      `,
      timestamp: new Date(),
      id: this.generateMessageId()
    };

    this.conversation.push(testMessage);
    //this.saveConversationToStorage();

    // אלץ עדכון DOM
    this.cdr.detectChanges();

    this.scrollToBottom();

    // רנדור מרובה לוודא שהכל עובד
    console.log('🔄 Triggering multiple MathJax render attempts...');
    setTimeout(() => {
      this.renderMathJax();
      console.log('🕐 First render attempt at 200ms');
    }, 200);

    setTimeout(() => {
      this.renderMathJax();
      console.log('🕑 Second render attempt at 500ms');
    }, 500);

    setTimeout(() => {
      this.renderMathJax();
      console.log('🕒 Third render attempt at 1000ms');

      // בדיקה אחרי הרנדור
      setTimeout(() => {
        //const result = this.debugLatexContent();
        console.log('📊 Test results:', result);

        // עיצוב טבלאות אוטומטי גם בטסט
        console.log('🎨 Auto-styling test tables...');
        this.forceTableStyling();
      }, 500);
    }, 1000);
  } */

  // פונקציה לדיבוג תוכן LaTeX משופרת
  /* debugLatexContent() {
    const chatContent = this.chatBox.nativeElement.innerHTML;
    console.log('=== LATEX DEBUG REPORT ===');
    console.log('📄 Chat content length:', chatContent.length);

    // חיפוש נוסחאות LaTeX בכל הסוגים
    const displayLatex1 = chatContent.match(/\\\[[\s\S]*?\\\]/g);
    const displayLatex2 = chatContent.match(/\$\$[\s\S]*?\$\$/g);
    const inlineLatex1 = chatContent.match(/\\\([^)]*?\\\)/g);
    const inlineLatex2 = chatContent.match(/\$[^$\n]*?\$/g);

    console.log('🔍 Found LaTeX patterns:');
    console.log('  \\[...\\] display:', displayLatex1?.length || 0, displayLatex1);
    console.log('  $$...$$ display:', displayLatex2?.length || 0, displayLatex2);
    console.log('  \\(...\\) inline:', inlineLatex1?.length || 0, inlineLatex1);
    console.log('  $...$ inline:', inlineLatex2?.length || 0, inlineLatex2);

    // בדיקת MathJax elements שהתרנדרו
    const mathJaxElements = this.chatBox.nativeElement.querySelectorAll('mjx-container');
    console.log('✅ Rendered MathJax elements:', mathJaxElements.length);

    // בדיקת סטטוס MathJax
    const mathJax = (window as any).MathJax;
    console.log('🔧 MathJax status:', {
      loaded: !!mathJax,
      version: mathJax?.version || 'unknown',
      typesetPromise: !!mathJax?.typesetPromise,
      startup: !!mathJax?.startup,
      ready: mathJax?.startup?.document?.state >= 8
    });

    // בדיקת טבלאות
    const tables = this.chatBox.nativeElement.querySelectorAll('table');
    console.log('📊 Found tables:', tables.length);

    return {
      displayLatex: (displayLatex1?.length || 0) + (displayLatex2?.length || 0),
      inlineLatex: (inlineLatex1?.length || 0) + (inlineLatex2?.length || 0),
      renderedMath: mathJaxElements.length,
      tables: tables.length,
      mathJaxReady: mathJax?.startup?.document?.state >= 8
    };
  } */
}