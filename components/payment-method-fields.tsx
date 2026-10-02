"use client";

import { TRANSFER_ACCOUNTS, type PaymentMethod, type TransferAccount } from "@/lib/payment-method";

export type { PaymentMethod, TransferAccount } from "@/lib/payment-method";

const accounts = TRANSFER_ACCOUNTS;

export function PaymentMethodFields({
  method,
  transferAccount,
  onMethodChange,
  onTransferAccountChange,
}: {
  method: PaymentMethod | "";
  transferAccount: TransferAccount | "";
  onMethodChange: (method: PaymentMethod) => void;
  onTransferAccountChange: (account: TransferAccount | "") => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">
        Phương thức thanh toán
        <select
          className="ui-input mt-1 w-full"
          value={method}
          onChange={(event) => {
            const next = event.target.value as PaymentMethod;
            onMethodChange(next);
            if (next === "cash") onTransferAccountChange("");
          }}
        >
          <option value="" disabled>Chọn phương thức</option>
          <option value="cash">Tiền mặt</option>
          <option value="transfer">Chuyển khoản</option>
        </select>
      </label>
      {method === "transfer" && (
        <label className="text-sm font-bold">
          Tài khoản chuyển khoản
          <select
            className="ui-input mt-1 w-full"
            value={transferAccount}
            onChange={(event) => onTransferAccountChange(event.target.value as TransferAccount | "")}
            required
          >
            <option value="">Chọn H / A / S / V</option>
            {accounts.map((account) => (
              <option key={account} value={account}>{account}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
