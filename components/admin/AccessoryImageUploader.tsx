"use client";

import { useState } from "react";

export default function AccessoryImageUploader({ onUploaded, onBusyChange, disabled = false }: { onUploaded: (url: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage("Uploading...");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/accessories/images", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.url !== "string") throw new Error(payload.error || "Image upload failed.");
      onUploaded(payload.url);
      setMessage("Image uploaded. Save the form to publish it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return <label className="block font-bold">Upload image
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void upload(file);
      event.target.value = "";
    }} className="mt-1 block w-full text-sm" />
    <span className="mt-1 block text-xs font-normal text-slate-600">JPEG, PNG, or WebP up to 5 MB.</span>
    {message && <span role="status" className="mt-2 block text-xs">{message}</span>}
  </label>;
}
