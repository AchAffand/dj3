const quantityFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}

export function formatRupiah(value: number): string {
  return rupiahFormatter.format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(value));
}
