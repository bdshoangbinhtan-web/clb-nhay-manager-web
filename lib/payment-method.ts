export type PaymentMethod = "cash" | "transfer";
export type TransferAccount = "H" | "A" | "S" | "V";

export const TRANSFER_ACCOUNTS: readonly TransferAccount[] = ["H", "A", "S", "V"];

export function normalizeTransferAccount(
  method: PaymentMethod,
  account: string | null | undefined,
): TransferAccount | null {
  if (method === "cash") return null;
  const normalized = account?.trim().toUpperCase();
  if (normalized && TRANSFER_ACCOUNTS.includes(normalized as TransferAccount)) {
    return normalized as TransferAccount;
  }
  throw new Error("Chuyển khoản phải chọn H, A, S hoặc V.");
}
