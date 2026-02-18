import 'zone.js';
import { AppComponent } from './app/app.component';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

bootstrapApplication(AppComponent,{
  providers: [
    // HTTP Client עם interceptors
    provideHttpClient(withInterceptorsFromDi()),
    
    // Modules
    importProvidersFrom(
      CommonModule,
      FormsModule
    ),

    // Services - הם כבר מוגדרים עם providedIn: 'root' אז לא צריך להוסיף כאן
  ]
}).catch(err => console.error(err));