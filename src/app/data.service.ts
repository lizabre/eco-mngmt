import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:3000/api';

export interface Dept {
  id: string;
  name: string;
  type: string;
  parentId: string;
  area: number | null;
}
export interface Res {
  id: string;
  name: string;
  unit: string;
  tariff: number;
}
export interface Limit {
  d: string;
  r: string;
  min: number;
  max: number;
  base: number;
}
export interface Cons {
  d: string;
  r: string;
  year: number;
  qty: number;
  type: 'synthetic' | 'manual';
}
export interface Prod {
  d: string;
  year: number;
  tons: number;
}

export interface PassportRow {
  key: string;
  label: string;
  resourceId: string;
  src: 'cons' | 'out';
  kind: 'qty' | 'cost' | 'production' | 'sales';
  unit: string;
  editable: boolean;
  months: number[]; // 12 значень, січень..грудень
  total: number;
}
export interface PassportData {
  year: number;
  departmentId: string | null;
  rows: PassportRow[];
}

const ACTIVITY: Record<number, number> = {
  2016: 1,
  2017: 1,
  2018: 1,
  2019: 0.95,
  2020: 0.88,
  2021: 0.95,
  2022: 0.8,
  2023: 0.75,
  2024: 0.82,
  2025: 0.8,
};

@Injectable({ providedIn: 'root' })
export class DataService {
  years = Object.keys(ACTIVITY).map(Number);
  depts = signal<Dept[]>([]);
  resources = signal<Res[]>([]);
  limits = signal<Limit[]>([]);
  cons = signal<Cons[]>([]);
  prod = signal<Prod[]>([]);

  constructor(private http: HttpClient) {
    this.load();
  }

  load() {
    this.http.get<any>(`${API}/data`).subscribe((d) => {
      this.depts.set(d.departments);
      this.resources.set(d.resources);
      this.limits.set(d.limits);
      this.cons.set(d.consumption);
      this.prod.set(d.production);
    });
  }

  /** Помісячна таблиця паспорта; без departmentId — все підприємство */
  passport(year: number, departmentId?: string) {
    const q = `year=${year}` + (departmentId ? `&departmentId=${departmentId}` : '');
    return this.http.get<PassportData>(`${API}/passport?${q}`);
  }
  /** Запис однієї клітинки таблиці (споживання або виробництво/продаж за місяць) */
  saveCell(row: PassportRow, d: string, year: number, month: number, qty: number): Observable<unknown> {
    return row.src === 'cons'
      ? this.http.put(`${API}/consumption`, { d, r: row.resourceId, year, month, qty })
      : this.http.put(`${API}/energy-output`, { d, r: row.resourceId, year, month, kind: row.kind, qty });
  }

  private send(o: Observable<unknown>) {
    o.subscribe({ error: (e) => console.error('API error', e) });
  }

  addDept(d: Dept) {
    this.depts.update((a) => [...a, d]);
    this.send(this.http.post(`${API}/departments`, d));
  }
  removeDept(id: string) {
    this.depts.update((a) => a.filter((x) => x.id !== id));
    this.send(this.http.delete(`${API}/departments/${id}`));
  }
  addRes(r: Res) {
    this.resources.update((a) => [...a, r]);
    this.send(this.http.post(`${API}/resources`, r));
  }
  removeRes(id: string) {
    this.resources.update((a) => a.filter((x) => x.id !== id));
    this.send(this.http.delete(`${API}/resources/${id}`));
  }
  setTariff(id: string, tariff: number) {
    this.resources.update((a) => a.map((r) => (r.id === id ? { ...r, tariff } : r)));
    this.send(this.http.put(`${API}/resources/${id}/tariff`, { tariff }));
  }

  q(d: string, r: string, y: number) {
    return this.cons().find((c) => c.d === d && c.r === r && c.year === y)?.qty ?? 0;
  }
  hasLimit(d: string, r: string) {
    return this.limits().some((l) => l.d === d && l.r === r);
  }
  setQ(d: string, r: string, year: number, qty: number) {
    this.cons.update((a) => [
      ...a.filter((c) => !(c.d === d && c.r === r && c.year === year)),
      { d, r, year, qty, type: 'manual' },
    ]);
    this.send(this.http.put(`${API}/consumption`, { d, r, year, qty }));
  }
  total(r: string, y: number) {
    return this.cons()
      .filter((c) => c.r === r && c.year === y)
      .reduce((s, c) => s + c.qty, 0);
  }
  deptTotalCost(d: string, y: number) {
    return this.resources().reduce((s, r) => s + this.q(d, r.id, y) * r.tariff, 0);
  }

  p(d: string, y: number) {
    return this.prod().find((x) => x.d === d && x.year === y)?.tons ?? 0;
  }
  setP(d: string, year: number, tons: number) {
    this.prod.update((a) => [
      ...a.filter((x) => !(x.d === d && x.year === year)),
      { d, year, tons },
    ]);
    this.send(this.http.put(`${API}/production`, { d, year, tons }));
  }

  /** Автогенерація: C = B * K * (1 + eps), eps ∈ [-10%; +10%], обмеження [min; max] */
  generate(years: number[]) {
    const fresh: Cons[] = [];
    for (const y of years) {
      const v = y === 2022 || y === 2023 ? 0.15 : 0.1;
      for (const l of this.limits()) {
        const q = l.base * ACTIVITY[y] * (1 + (Math.random() * 2 - 1) * v);
        fresh.push({
          d: l.d,
          r: l.r,
          year: y,
          qty: Math.round(Math.max(l.min, Math.min(l.max, q)) * 100) / 100,
          type: 'synthetic',
        });
      }
    }
    this.cons.update((a) => [...a.filter((c) => !years.includes(c.year)), ...fresh]);
    this.send(
      this.http.put(
        `${API}/consumption/bulk`,
        fresh.map((c) => ({ d: c.d, r: c.r, year: c.year, qty: c.qty, type: 'synthetic' })),
      ),
    );
  }

  exportCsv() {
    const rows = ['Підрозділ;Ресурс;Одиниця;Рік;Обсяг;Тип даних'];
    for (const c of [...this.cons()].sort((a, b) => a.year - b.year)) {
      const d = this.depts().find((x) => x.id === c.d)?.name,
        r = this.resources().find((x) => x.id === c.r);
      rows.push(
        `${d};${r?.name};${r?.unit};${c.year};${String(c.qty).replace('.', ',')};${c.type}`,
      );
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    a.download = 'energy-passport.csv';
    a.click();
  }
}
