"use client";

import { deleteCustomer } from "@/app/actions/admin";

export default function DeleteCustomerButton({
  id,
  name,
  className,
}: {
  id: number;
  name: string;
  className: string;
}) {
  return (
    <form
      action={deleteCustomer}
      onSubmit={(e) => {
        if (
          !confirm(
            `Delete ${name}?\n\nThis removes their account, memberships, bookings, and waiver record. This can't be undone.`
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        Delete
      </button>
    </form>
  );
}
