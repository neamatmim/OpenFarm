const DAY_MS = 86_400_000;
const paisa = (amount: number) => Math.round(amount * 100);

export interface SupplierPlannedInvoice {
  id: string;
  number: string;
  invoicedOn: string;
  dueOn: string;
  purchasedMoney: number;
  paidMoney: number;
  owingMoney: number;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    retired: boolean;
  };
}

const calendarDayAfter = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const moneyTotals = (
  invoices: readonly SupplierPlannedInvoice[],
  today: string,
  through7: string,
  through30: string,
  monthEnd: string
) => {
  const total = {
    outstanding: 0,
    overdue: 0,
    next7: 0,
    next30: 0,
    byMonthEnd: 0,
  };
  for (const invoice of invoices) {
    const amount = paisa(invoice.owingMoney);
    total.outstanding += amount;
    if (invoice.dueOn < today) {
      total.overdue += amount;
    } else {
      if (invoice.dueOn <= through7) {
        total.next7 += amount;
      }
      if (invoice.dueOn <= through30) {
        total.next30 += amount;
      }
    }
    if (invoice.dueOn <= monthEnd) {
      total.byMonthEnd += amount;
    }
  }
  return {
    outstandingMoney: total.outstanding / 100,
    overdueMoney: total.overdue / 100,
    next7Money: total.next7 / 100,
    next30Money: total.next30 / 100,
    byMonthEndMoney: total.byMonthEnd / 100,
  };
};

/** Seven/thirty calendar days include today. Upcoming totals exclude overdue; month-end includes it. */
export const supplierPaymentPlan = (
  invoices: readonly SupplierPlannedInvoice[],
  today: string
) => {
  const through7 = calendarDayAfter(today, 6);
  const through30 = calendarDayAfter(today, 29);
  const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + 1, 0);
  const monthEnd = month.toISOString().slice(0, 10);
  const open = invoices
    .filter((invoice) => paisa(invoice.owingMoney) > 0)
    .toSorted(
      (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id)
    );
  const grouped = new Map<
    string,
    {
      supplier: SupplierPlannedInvoice["supplier"];
      invoices: SupplierPlannedInvoice[];
    }
  >();
  for (const invoice of open) {
    let group = grouped.get(invoice.supplier.id);
    if (!group) {
      group = { supplier: invoice.supplier, invoices: [] };
      grouped.set(invoice.supplier.id, group);
    }
    group.invoices.push(invoice);
  }
  return {
    today,
    through7,
    through30,
    monthEnd,
    ...moneyTotals(open, today, through7, through30, monthEnd),
    suppliers: [...grouped.values()].map((group) => ({
      ...group,
      ...moneyTotals(group.invoices, today, through7, through30, monthEnd),
    })),
  };
};
