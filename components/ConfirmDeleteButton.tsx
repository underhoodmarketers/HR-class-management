"use client";

export default function ConfirmDeleteButton({
  id,
  action,
  confirmText,
  className,
  label = "Delete",
  extraFields,
}: {
  id: number;
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  className: string;
  label?: string;
  extraFields?: Record<string, string | number>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {extraFields
        ? Object.entries(extraFields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
