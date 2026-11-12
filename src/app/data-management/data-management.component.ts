import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DepartmentsTabComponent } from '../tabs/departments-tab/departments-tab.component';
import { ResourcesTabComponent } from '../tabs/resources-tab/resources-tab.component';
import { TariffsTabComponent } from '../tabs/tariffs-tab/tariffs-tab.component';
import { ConsumptionTabComponent } from '../tabs/consumption-tab/consumption-tab.component';

@Component({
  selector: 'app-data-management',
  standalone: true,
  imports: [
    RouterLink,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    DepartmentsTabComponent,
    ResourcesTabComponent,
    TariffsTabComponent,
    ConsumptionTabComponent,
  ],
  templateUrl: './data-management.component.html',
  styleUrl:'./data-management.component.css'
})
export class DataManagementComponent {}
