"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="button secondary"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void fetch("/api/auth/logout", { method: "POST" })
          .then((response) => {
            if (!response.ok) throw new Error("Sign out failed");
            router.replace("/login");
            router.refresh();
          })
          .catch(() => setPending(false));
      }}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
