// 📁 services/conversation.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface ConversationSummary {
  sessionId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  messageCount: number;
  lastActivity: Date;
  createdAt: Date;
  isFavorite: boolean;
  performance?: {
    responseTime: number;
    tokenCount: number;
    mathFormulas: number;
    charts: number;
    tables: number;
  };
}

export interface FullConversation {
  sessionId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  messages: Array<{
    sender: 'user' | 'ai';
    message: string;
    timestamp: Date;
    id: string;
  }>;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  isFavorite: boolean;
  performance?: any;
}

export interface ConversationFilters {
  category?: string;
  tags?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  favorites?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ConversationResponse {
  success: boolean;
  conversations: ConversationSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: {
    categories: string[];
    tags: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
  private baseUrl = 'http://shilmanlior2608.ddns.net:15000/api/conversations';
  
  // State management
  private conversationsSubject = new BehaviorSubject<ConversationSummary[]>([]);
  public conversations$ = this.conversationsSubject.asObservable();
  
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();
  
  private filtersSubject = new BehaviorSubject<ConversationFilters>({});
  public filters$ = this.filtersSubject.asObservable();

  constructor(private http: HttpClient) {}

  // 📋 קבלת רשימת שיחות
  getConversations(filters: ConversationFilters = {}): Observable<ConversationResponse> {
    this.loadingSubject.next(true);
    
    let params = new HttpParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          params = params.set(key, value.join(','));
        } else {
          params = params.set(key, value.toString());
        }
      }
    });

    return this.http.get<ConversationResponse>(this.baseUrl, { params }).pipe(
      map(response => {
        this.conversationsSubject.next(response.conversations);
        this.filtersSubject.next(filters);
        this.loadingSubject.next(false);
        return response;
      }),
      catchError(error => {
        console.error('❌ שגיאה בקבלת שיחות:', error);
        this.loadingSubject.next(false);
        throw error;
      })
    );
  }

  // 📖 טעינת שיחה מלאה
  loadConversation(sessionId: string): Observable<FullConversation> {
    return this.http.get<{success: boolean, conversation: FullConversation}>(`${this.baseUrl}/${sessionId}`).pipe(
      map(response => {
        if (!response.success) {
          throw new Error('שיחה לא נמצאה');
        }
        return response.conversation;
      }),
      catchError(error => {
        console.error('❌ שגיאה בטעינת שיחה:', error);
        throw error;
      })
    );
  }

  // 💾 שמירת שיחה
  saveConversation(sessionId: string, messages: any[], metadata: any = {}): Observable<any> {
    const body = { messages, metadata };
    
    return this.http.post(`${this.baseUrl}/${sessionId}/save`, body).pipe(
      catchError(error => {
        console.error('❌ שגיאה בשמירת שיחה:', error);
        throw error;
      })
    );
  }

  // ⭐ סימון/ביטול מועדפת
  toggleFavorite(sessionId: string): Observable<{success: boolean, isFavorite: boolean}> {
    return this.http.patch<{success: boolean, isFavorite: boolean}>(`${this.baseUrl}/${sessionId}/favorite`, {}).pipe(
      map(response => {
        // עדכון הרשימה המקומית
        const conversations = this.conversationsSubject.value;
        const updatedConversations = conversations.map(conv => 
          conv.sessionId === sessionId 
            ? { ...conv, isFavorite: response.isFavorite }
            : conv
        );
        this.conversationsSubject.next(updatedConversations);
        
        return response;
      }),
      catchError(error => {
        console.error('❌ שגיאה בעדכון מועדפת:', error);
        throw error;
      })
    );
  }

  // 🗑️ מחיקת שיחה
  deleteConversation(sessionId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${sessionId}`).pipe(
      map(response => {
        // הסרה מהרשימה המקומית
        const conversations = this.conversationsSubject.value;
        const filteredConversations = conversations.filter(conv => conv.sessionId !== sessionId);
        this.conversationsSubject.next(filteredConversations);
        
        return response;
      }),
      catchError(error => {
        console.error('❌ שגיאה במחיקת שיחה:', error);
        throw error;
      })
    );
  }

  // 🔍 חיפוש מתקדם
  searchConversations(query: string, filters: ConversationFilters = {}): Observable<ConversationResponse> {
    const searchFilters = {
      ...filters,
      search: query
    };
    
    return this.getConversations(searchFilters);
  }

  // 📊 סטטיסטיקות
  getStatistics(): Observable<any> {
    return this.http.get(`${this.baseUrl}/stats/overview`).pipe(
      catchError(error => {
        console.error('❌ שגיאה בקבלת סטטיסטיקות:', error);
        throw error;
      })
    );
  }

  // 📤 יצוא שיחה
  exportConversation(sessionId: string, format: 'json' | 'txt' = 'json'): Observable<Blob> {
    const params = new HttpParams().set('format', format);
    
    return this.http.get(`${this.baseUrl}/${sessionId}/export`, {
      params,
      responseType: 'blob'
    }).pipe(
      catchError(error => {
        console.error('❌ שגיאה ביצוא שיחה:', error);
        throw error;
      })
    );
  }

  // 🔄 רענון רשימת שיחות
  refreshConversations(): void {
    const currentFilters = this.filtersSubject.value;
    this.getConversations(currentFilters).subscribe();
  }

  // 🎯 פילטר מהיר למועדפות
  getFavoriteConversations(): Observable<ConversationResponse> {
    return this.getConversations({ favorites: true });
  }

  // 📅 פילטר לפי תאריך
  getConversationsByDateRange(dateFrom: string, dateTo: string): Observable<ConversationResponse> {
    return this.getConversations({ dateFrom, dateTo });
  }

  // 🏷️ פילטר לפי קטגוריה
  getConversationsByCategory(category: string): Observable<ConversationResponse> {
    return this.getConversations({ category });
  }

  // #️⃣ פילטר לפי תגיות
  getConversationsByTags(tags: string[]): Observable<ConversationResponse> {
    return this.getConversations({ tags });
  }

  // 🎨 Helper methods
  getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      'ניתוח פנסיוני': '🏦',
      'ניתוח משכנתא והשוואת מסלולים': '🏠',
      'ניתוח הלוואה': '💳',
      'ניתוח תקציב אישי': '📊',
      'חישוב חיסכון והשקעות': '💰',
      'השוואת קנייה מול שכירות': '🔄',
      'תכנון פיננסי למשפחה וילדים': '👨‍👩‍👧‍👦',
      'ניתוח פיננסי כללי': '📈'
    };
    
    return icons[category] || '💼';
  }

  getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      'ניתוח פנסיוני': '#4caf50',
      'ניתוח משכנתא והשוואת מסלולים': '#2196f3',
      'ניתוח הלוואה': '#ff9800',
      'ניתוח תקציב אישי': '#9c27b0',
      'חישוב חיסכון והשקעות': '#00bcd4',
      'השוואת קנייה מול שכירות': '#795548',
      'תכנון פיננסי למשפחה וילדים': '#e91e63',
      'ניתוח פיננסי כללי': '#607d8b'
    };
    
    return colors[category] || '#64b5f6';
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatTimeAgo(date: Date | string): string {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דקות`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    
    return this.formatDate(date);
  }

  // 🧹 Clear state
  clearState(): void {
    this.conversationsSubject.next([]);
    this.filtersSubject.next({});
    this.loadingSubject.next(false);
  }

  
}