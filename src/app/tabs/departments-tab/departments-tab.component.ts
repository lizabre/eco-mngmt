import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService } from '../../data.service';
import { TAB_STYLES } from '../tab-styles';

@Component({
  selector: 'app-departments-tab',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './departments-tab.component.html',
  styles: [TAB_STYLES],
})
export class DepartmentsTabComponent {
  ds = inject(DataService);
  snack = inject(MatSnackBar);
  types = ['Підприємство', 'Шахта', 'Підрозділ'];
  cols = ['id', 'name', 'type', 'parentId', 'area', 'act'];
  nd: any = { id: '', name: '', type: 'Підрозділ', parentId: 'P00', area: null };

  add() {
    if (!this.nd.id || !this.nd.name || this.ds.depts().some((d) => d.id === this.nd.id)) {
      this.snack.open('Вкажіть унікальний код і назву', 'OK', { duration: 3000 });
      return;
    }
    this.ds.addDept({ ...this.nd });
    this.nd = { id: '', name: '', type: 'Підрозділ', parentId: 'P00', area: null };
  }
}
