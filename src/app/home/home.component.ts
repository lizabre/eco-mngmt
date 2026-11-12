import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { DataService } from '../data.service';

@Component({
  selector: 'app-home', standalone: true,
  imports: [RouterLink, DecimalPipe, FormsModule, MatToolbarModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatSelectModule, MatFormFieldModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  ds = inject(DataService);
  dCols = ['id', 'name', 'type', 'parentId', 'area'];
  rCols = ['name', 'unit', 'tariff', 'total', 'cost'];
  year = 2025; yearSig = signal(2025); resSig = signal('EL');
  mines = computed(() => this.ds.depts().filter(d => d.type === 'Шахта'));
  bars = computed(() => {
    const vals = this.ds.years.map(y => ({ year: y, v: this.ds.total(this.resSig(), y) }));
    const max = Math.max(...vals.map(x => x.v), 1);
    return vals.map(x => ({ ...x, h: x.v / max * 80 }));
  });
}
