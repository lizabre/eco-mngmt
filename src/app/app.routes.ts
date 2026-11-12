import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { DataManagementComponent } from './data-management/data-management.component';
import { PassportTableComponent } from './passport-table/passport-table.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'data', component: DataManagementComponent },
  { path: 'passport', component: PassportTableComponent },
  { path: '**', redirectTo: '' }
];
