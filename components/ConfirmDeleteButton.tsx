"use client";

export default function ConfirmDeleteButton({
  id,
  action,
  confirmText,
  className,
  label = "Delete",
}: {
  id: number;
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  className: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
