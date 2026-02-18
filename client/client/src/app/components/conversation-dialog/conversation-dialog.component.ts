// 📁 components/conversation-dialog.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  ConversationService, 
  ConversationSummary, 
  FullConversation, 
  ConversationFilters,
  ConversationResponse 
} from '../../services/conversation.service';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-conversation-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversation-dialog.component.html',
  styleUrls: ['./conversation-dialog.component.scss']
})
export class ConversationDialogComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() conversationSelected = new EventEmitter<FullConversation>();
  @Output() closeEvent = new EventEmitter<void>();

  conversations: ConversationSummary[] = [];
  loading = false;
  searchQuery = '';
  showStats = false;
  statistics: any = null;
  selectedConversations: string[] = [];

  filters: ConversationFilters = {
    page: 1,
    limit: 20,
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  };

  pagination: any = null;
  availableCategories: string[] = [];
  availableTags: string[] = [];

  private searchSubject = new Subject<string>();
  private subscriptions: Subscription[] = [];

  constructor(
    private conversationService: ConversationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Setup search debouncing
    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(query => {
        this.filters.search = query;
        this.filters.page = 1;
        this.loadConversations();
      })
    );

    // Load initial data
    if (this.isOpen) {
      this.loadConversations();
    }

    this.refreshConversations();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadConversations() {
    this.loading = true;
    
    this.conversationService.getConversations(this.filters).subscribe({
      next: (response: ConversationResponse) => {
        this.conversations = response.conversations;
        this.pagination = response.pagination;
        this.availableCategories = response.filters.categories;
        this.availableTags = response.filters.tags;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ שגיאה בטעינת שיחות:', error);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.searchQuery);
  }

  applyFilters() {
    this.filters.page = 1;
    this.loadConversations();
  }

  changePage(page: number) {
    this.filters.page = page;
    this.loadConversations();
  }

  refreshConversations() {
    this.conversationService.clearState();
    this.loadConversations();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filters = {
      page: 1,
      limit: this.filters.limit || 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    };
    this.loadConversations();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.searchQuery ||
      this.filters.category ||
      this.filters.tags?.length ||
      this.filters.dateFrom ||
      this.filters.dateTo ||
      this.filters.favorites
    );
  }

  loadConversation(conv: ConversationSummary) {
    this.conversationService.loadConversation(conv.sessionId).subscribe({
      next: (conversation: FullConversation) => {
        this.conversationSelected.emit(conversation);
        this.closeDialog();
      },
      error: (error) => {
        console.error('❌ שגיאה בטעינת שיחה:', error);
        alert('שגיאה בטעינת השיחה');
      }
    });
  }

  toggleFavorite(event: Event, conv: ConversationSummary) {
    event.stopPropagation();
    
    this.conversationService.toggleFavorite(conv.sessionId).subscribe({
      next: (response) => {
        conv.isFavorite = response.isFavorite;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ שגיאה בעדכון מועדפת:', error);
        alert('שגיאה בעדכון המועדפת');
      }
    });
  }

  exportConversation(event: Event, conv: ConversationSummary) {
    event.stopPropagation();
    
    this.conversationService.exportConversation(conv.sessionId, 'json').subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `conversation_${conv.sessionId}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('❌ שגיאה ביצוא שיחה:', error);
        alert('שגיאה ביצוא השיחה');
      }
    });
  }

  duplicateConversation(event: Event, conv: ConversationSummary) {
    event.stopPropagation();
    
    // Load and duplicate conversation
    this.conversationService.loadConversation(conv.sessionId).subscribe({
      next: (conversation: FullConversation) => {
        const newSessionId = this.generateUUID();
        const duplicatedMessages = conversation.messages.map(msg => ({
          ...msg,
          id: this.generateMessageId()
        }));

        this.conversationService.saveConversation(
          newSessionId,
          duplicatedMessages,
          {
            ...conversation.metadata,
            duplicatedFrom: conv.sessionId,
            duplicatedAt: new Date()
          }
        ).subscribe({
          next: () => {
            alert('שיחה שוכפלה בהצלחה!');
            this.refreshConversations();
          },
          error: (error) => {
            console.error('❌ שגיאה בשכפול שיחה:', error);
            alert('שגיאה בשכפול השיחה');
          }
        });
      },
      error: (error) => {
        console.error('❌ שגיאה בטעינת שיחה לשכפול:', error);
        alert('שגיאה בשכפול השיחה');
      }
    });
  }

  deleteConversation(event: Event, conv: ConversationSummary) {
    event.stopPropagation();
    
    if (confirm(`האם אתה בטוח שברצונך למחוק את השיחה "${conv.title}"?`)) {
      this.conversationService.deleteConversation(conv.sessionId).subscribe({
        next: () => {
          this.conversations = this.conversations.filter(c => c.sessionId !== conv.sessionId);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ שגיאה במחיקת שיחה:', error);
          alert('שגיאה במחיקת השיחה');
        }
      });
    }
  }

  showStatistics() {
    this.conversationService.getStatistics().subscribe({
      next: (stats) => {
        this.statistics = stats.statistics;
        this.showStats = true;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ שגיאה בקבלת סטטיסטיקות:', error);
        alert('שגיאה בקבלת הסטטיסטיקות');
      }
    });
  }

  closeDialog() {
    this.isOpen = false;
    this.closeEvent.emit();
  }

  // Pagination helpers
  getPageNumbers(): (number | string)[] {
    if (!this.pagination) return [];
    
    const current = this.pagination.page;
    const total = this.pagination.pages;
    const delta = 2;
    const range: (number | string)[] = [];
    
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }
    
    if (current - delta > 2) {
      range.unshift('...');
    }
    if (current + delta < total - 1) {
      range.push('...');
    }
    
    range.unshift(1);
    if (total > 1) {
      range.push(total);
    }
    
    return range;
  }

  getDisplayRange(): string {
    if (!this.pagination) return '';
    
    const start = (this.pagination.page - 1) * this.pagination.limit + 1;
    const end = Math.min(this.pagination.page * this.pagination.limit, this.pagination.total);
    
    return `${start}-${end}`;
  }

  // Selection methods
  toggleSelection(conv: ConversationSummary) {
    const index = this.selectedConversations.indexOf(conv.sessionId);
    if (index > -1) {
      this.selectedConversations.splice(index, 1);
    } else {
      this.selectedConversations.push(conv.sessionId);
    }
  }

  clearSelection() {
    this.selectedConversations = [];
  }

  exportSelectedConversations() {
    if (this.selectedConversations.length === 0) return;
    
    // Export multiple conversations as zip or combined JSON
    const promises = this.selectedConversations.map(sessionId =>
      this.conversationService.exportConversation(sessionId, 'json').toPromise()
    );

    Promise.all(promises).then(blobs => {
      // Create combined export
      const exportData = {
        exportDate: new Date().toISOString(),
        conversations: this.selectedConversations,
        totalCount: this.selectedConversations.length
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `conversations_export_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

      this.clearSelection();
    }).catch(error => {
      console.error('❌ שגיאה ביצוא קבוצתי:', error);
      alert('שגיאה ביצוא השיחות');
    });
  }

  deleteSelectedConversations() {
    if (this.selectedConversations.length === 0) return;
    
    if (confirm(`האם אתה בטוח שברצונך למחוק ${this.selectedConversations.length} שיחות?`)) {
      const promises = this.selectedConversations.map(sessionId =>
        this.conversationService.deleteConversation(sessionId).toPromise()
      );

      Promise.all(promises).then(() => {
        this.clearSelection();
        this.refreshConversations();
      }).catch(error => {
        console.error('❌ שגיאה במחיקה קבוצתית:', error);
        alert('שגיאה במחיקת השיחות');
      });
    }
  }

  // Helper methods
  trackBySessionId(index: number, conv: ConversationSummary): string {
    return conv.sessionId;
  }

  getCategoryIcon(category: string): string {
    return this.conversationService.getCategoryIcon(category);
  }

  formatTimeAgo(date: Date | string): string {
    return this.conversationService.formatTimeAgo(date);
  }

  formatDate(date: Date | string): string {
    return this.conversationService.formatDate(date);
  }

  getMostPopularCategory(): string {
    if (!this.statistics?.categories?.length) return 'לא ידוע';
    return this.statistics.categories[0]._id;
  }

  getAverageMessages(): number {
    if (!this.statistics?.recentActivity?.length) return 0;
    const total = this.statistics.recentActivity.reduce((sum: number, activity: any) => 
      sum + (activity.metadata?.totalMessages || 0), 0);
    return Math.round(total / this.statistics.recentActivity.length);
  }

  getFavoriteCount(): number {
    return this.conversations.filter(conv => conv.isFavorite).length;
  }

  getCategoryPercentage(count: number): number {
    if (!this.statistics?.total) return 0;
    return (count / this.statistics.total) * 100;
  }

  // Utility methods
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private generateMessageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}