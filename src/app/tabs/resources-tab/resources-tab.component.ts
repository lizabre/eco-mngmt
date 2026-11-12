import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../data.service';
import { TAB_STYLES } from '../tab-styles';

@Component({
  selector: 'app-resources-tab',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './resources-tab.component.html',
  styles: [TAB_STYLES],
})
export class ResourcesTabComponent {
  ds = inject(DataService);
  snack = inject(MatSnackBar);
  cols = ['id', 'name', 'unit', 'act'];
  nr: any = { id: '', name: '', unit: '', tariff: 0 };

  add() {
    if (!this.nr.id || !this.nr.name || this.ds.resources().some((r) => r.id === this.nr.id)) {
      this.snack.open('Вкажіть унікальний код і назву', 'OK', { duration: 3000 });
      return;
    }
    this.ds.addRes({ ...this.nr });
    this.nr = { id: '', name: '', unit: '', tariff: 0 };
  }
}
