import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { Search, Download, Users, Phone, MapPin, ReceiptText } from 'lucide-react';
import { cn } from '../lib/utils';

interface Customer {
  id: number;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  outstanding_balance: number;
}

export default function Customers() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const [search, setSearch] = useState('');

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['all-customers-list'],
    queryFn: () => cmd('get_all_customers'),
  });

  const filtered = customers.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const header = ['ID,Name,Phone,Address,Notes,Outstanding Balance'];
    const rows = filtered.map(c => 
      `${c.id},"${c.name || ''}","${c.phone || ''}","${c.address || ''}","${c.notes || ''}",${c.outstanding_balance}`
    );
    const csvContent = "data:text/csv;charset=utf-8," + header.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Customers_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" /> Customers Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">View all customers who visited the shop and their contact details.</p>
        </div>
        <button onClick={handleExportCSV} className="btn-secondary" disabled={filtered.length === 0}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="text-sm text-slate-500">
            Showing {filtered.length} customers
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Phone Number</th>
                <th>Address</th>
                <th className="text-right">Outstanding Udhaar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-10">Loading customers...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-slate-500">No customers found</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs uppercase">
                          {(c.name || '?').charAt(0)}
                        </div>
                        <span className="font-medium text-slate-800">{c.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {c.phone || '-'}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {c.address || '-'}
                      </div>
                    </td>
                    <td className="text-right font-mono font-medium">
                      <span className={c.outstanding_balance > 0 ? "text-red-600" : "text-green-600"}>
                        {formatCurrency(c.outstanding_balance, currency_symbol)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
