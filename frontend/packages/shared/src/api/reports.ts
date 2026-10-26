import type { ApiClient } from './client';

export interface SalesReportQuery {
  from?: string;
  to?: string;
  hour_from?: number;
  hour_to?: number;
  search?: string;
  category_id?: number;
}

export interface ItemReportRow {
  product_id: number;
  product_name: string;
  category_name: string;
  units: number;
  gross_sales: number;
  cost: number;
  margin_pct: number | null;
  share_pct: number;
}

export interface ItemsReportResponse {
  summary: {
    total_units: number;
    total_gross: number;
    total_cost: number;
    margin_pct: number | null;
    items_count: number;
  };
  items: ItemReportRow[];
}

export interface CategoryReportRow {
  category_id: number;
  category_name: string;
  units: number;
  gross_sales: number;
  share_pct: number;
}

export interface CategoriesReportResponse {
  summary: {
    total_units: number;
    total_gross: number;
    categories_count: number;
  };
  categories: CategoryReportRow[];
}

export interface EmployeeReportRow {
  user_id: number;
  employee_name: string;
  tickets_count: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  avg_ticket: number;
  share_pct: number;
}

export interface EmployeesReportResponse {
  summary: {
    total_tickets: number;
    total_gross: number;
    total_discounts: number;
    total_net: number;
    avg_ticket: number;
  };
  employees: EmployeeReportRow[];
}

export interface PaymentReportRow {
  payment_method: string;
  method_label: string;
  transactions_count: number;
  total_amount: number;
  share_pct: number;
}

export interface PaymentsReportResponse {
  summary: {
    total_transactions: number;
    total_amount: number;
  };
  payments: PaymentReportRow[];
}

export interface DiscountedSaleRow {
  id: number;
  sale_number: number | null;
  created_at: string;
  subtotal: number;
  discount: number;
  total: number;
  discount_pct: number;
  payment_method: string;
  user_name: string;
  note: string;
}

export interface DiscountsReportResponse {
  summary: {
    discounted_sales_count: number;
    total_discounts: number;
    total_gross_discounted: number;
    total_net_discounted: number;
    avg_discount_pct: number;
  };
  sales: DiscountedSaleRow[];
}

export interface TaxReportTypeRow {
  invoice_type: string;
  invoices_count: number;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
}

export interface TaxesReportResponse {
  summary: {
    total_sales_count: number;
    total_revenue: number;
    total_invoiced: number;
    total_taxed_net: number;
    total_vat: number;
    has_tax_breakdown: boolean;
  };
  invoices_by_type: TaxReportTypeRow[];
}

export function reportsApi(client: ApiClient) {
  const queryStr = (p?: SalesReportQuery) => {
    if (!p) return '';
    const q = new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return q ? `?${q}` : '';
  };

  return {
    salesByItem: (params?: SalesReportQuery) =>
      client.get<ItemsReportResponse>(`/reports/sales/items${queryStr(params)}`),
    salesByCategory: (params?: SalesReportQuery) =>
      client.get<CategoriesReportResponse>(`/reports/sales/categories${queryStr(params)}`),
    salesByEmployee: (params?: SalesReportQuery) =>
      client.get<EmployeesReportResponse>(`/reports/sales/employees${queryStr(params)}`),
    salesByPayment: (params?: SalesReportQuery) =>
      client.get<PaymentsReportResponse>(`/reports/sales/payments${queryStr(params)}`),
    discounts: (params?: SalesReportQuery) =>
      client.get<DiscountsReportResponse>(`/reports/sales/discounts${queryStr(params)}`),
    taxes: (params?: SalesReportQuery) =>
      client.get<TaxesReportResponse>(`/reports/sales/taxes${queryStr(params)}`),
  };
}
