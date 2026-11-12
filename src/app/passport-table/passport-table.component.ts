import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataService, PassportData, PassportRow } from '../data.service';

export const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

@Component({
  selector: 'app-passport-table',
  standalone: true,
  imports: [
    RouterLink, DecimalPipe, FormsModule, MatToolbarModule, MatCardModule, MatButtonModule,
    MatIconModule, MatSelectModule, MatFormFieldModule, MatSnackBarModule,
  ],
  templateUrl: './passport-table.component.html',
  styleUrl: './passport-table.component.css',
})
export class PassportTableComponent {
  ds = inject(DataService);
  snack = inject(MatSnackBar);

  months = MONTHS;
  year = signal(2025);
  dept = signal(''); // '' = все підприємство
  data = signal<PassportData | null>(null);

  /** Підрозділи, для яких можна вводити дані: без дочірніх (тобто не «Підприємство») */
  leafDepts = computed(() =>
    this.ds.depts().filter((d) => !this.ds.depts().some((x) => x.parentId === d.id)),
  );
  canEdit = computed(() => !!this.dept() && this.leafDepts().some((d) => d.id === this.dept()));

  constructor() {
    this.reload();
  }

  reload() {
    this.ds.passport(this.year(), this.dept() || undefined).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.snack.open('Не вдалося завантажити таблицю', 'OK', { duration: 3000 }),
    });
  }

  setYear(y: number) {
    this.year.set(y);
    this.reload();
  }
  setDept(id: string) {
    this.dept.set(id);
    this.reload();
  }

  save(row: PassportRow, month: number, raw: string) {
    const qty = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
    if (qty === row.months[month]) return;
    this.ds.saveCell(row, this.dept(), this.year(), month + 1, qty).subscribe({
      next: () => {
        this.reload(); // перерахувати витрати та підсумки
        this.ds.load(); // оновити річні дані на головній
      },
      error: () => this.snack.open('Помилка збереження', 'OK', { duration: 3000 }),
    });
  }

  exportCsv() {
    const d = this.data();
    if (!d) return;
    const num = (v: number) => String(v).replace('.', ',');
    const rows = [['Рік', 'Ресурс', 'Одиниця', ...MONTHS, 'Усього за рік'].join(';')];
    for (const r of d.rows) rows.push([d.year, r.label, r.unit, ...r.months.map(num), num(r.total)].join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `energy-passport-${d.year}.csv`;
    a.click();
  }
}
