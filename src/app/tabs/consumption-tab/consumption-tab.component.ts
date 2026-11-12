import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../data.service';
import { TAB_STYLES } from '../tab-styles';

@Component({
  selector: 'app-consumption-tab',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatSelectModule, MatSnackBarModule],
  templateUrl: './consumption-tab.component.html',
  styles: [TAB_STYLES],
})
export class ConsumptionTabComponent {
  ds = inject(DataService);
  snack = inject(MatSnackBar);
  year = 2025;
  gen(years: number[]) {
    this.ds.generate(years);
    this.snack.open('Дані згенеровано', 'OK', { duration: 2000 });
  }
}
