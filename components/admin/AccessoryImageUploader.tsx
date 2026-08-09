"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function findImageLabels() {
  const heading = Array.from(document.querySelectorAll("h3")).find(
    (element) => element.textContent?.trim() === "Featured Aftermarket"
  );
  const section = heading?.parentElement;
  const featured = section ? (
    Array.from(section.querySelectorAll("label")).find((label) =>
      label.textContent?.trim().startsWith("Image Url")
    ) ?? null
  ) : null;
  const editor = document.querySelector<HTMLFormElement>("form.fixed.inset-0");
  const item = editor
    ? Array.from(editor.querySelectorAll("label")).find(
        (label) => label.textContent?.trim() === "Image URL"
      ) ?? null
    : null;
  const oldUpload = editor
    ? Array.from(editor.querySelectorAll("label")).find((label) =>
        label.textContent?.trim().startsWith("Upload image")
      ) ?? null
    : null;
  const actionSelect = editor?.querySelector<HTMLSelectElement>("select") ?? null;
  const aftermarketEditor = Boolean(
    actionSelect && !Array.from(actionSelect.options).some((option) => option.value === "builder")
  );
  const editorLabels = editor ? Array.from(editor.querySelectorAll("label")) : [];
  const showInBuilder = aftermarketEditor
    ? editorLabels.find((label) => label.textContent?.trim() === "Show in Builder") ?? null
    : null;
  const checkboxHost = showInBuilder?.parentElement ?? null;
  if (aftermarketEditor) {
    const actionLabel = editorLabels.find((label) => label.textContent?.trim().startsWith("Action label"));
    const actionUrl = editorLabels.find((label) => label.textContent?.trim().startsWith("Action URL"));
    const regularPrice = editorLabels.find((label) => label.textContent?.trim().startsWith("Price (dollars)"));
    const salePrice = editorLabels.find((label) => label.textContent?.trim().startsWith("Sale price (dollars)"));
    if (actionLabel?.firstChild) actionLabel.firstChild.textContent = "Manufacturer Button Text";
    if (actionUrl?.firstChild) actionUrl.firstChild.textContent = "Manufacturer URL";
    if (regularPrice?.firstChild) regularPrice.firstChild.textContent = "Regular Price";
    if (salePrice?.firstChild) salePrice.firstChild.textContent = "Sale Price";
  }
  return { featured, item, oldUpload, showInBuilder, checkboxHost, builderInput: showInBuilder?.querySelector<HTMLInputElement>("input") ?? null };
}

function updateReactInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function InlineUploader({ target }: { target: HTMLLabelElement }) {
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setMessage("Uploading...");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/admin/accessories/images", {
      method: "POST",
      body,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(payload.error ?? "Upload failed.");
      return;
    }

    const input = target?.querySelector<HTMLInputElement>("input");
    if (input) updateReactInput(input, payload.url);
    setMessage("Upload complete.");
  }

  return createPortal(
    <span className="mt-2 block rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="block text-sm font-black">Upload Image</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
        JPEG, PNG, or WebP up to 5 MB. You can also paste an image URL above.
      </span>
      <input
        className="mt-2 block w-full text-sm font-normal"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {message && (
        <span role="status" className="mt-2 block text-xs font-bold">
          {message}
        </span>
      )}
    </span>,
    target
  );
}

function ExclusionCheckbox({ target, source }: { target: HTMLElement; source: HTMLInputElement }) {
  return createPortal(<div><label className="flex gap-2 font-bold"><input type="checkbox" defaultChecked={!source.checked} onChange={() => { source.removeAttribute("disabled"); source.click(); }} />Do Not Add to IDS Pricing Catalog / Checkout</label><p className="mt-1 text-xs text-slate-600">Regular Price is required when this box is unchecked. Saved prices are ignored by IDS checkout while it is checked.</p></div>, target);
}

export default function AccessoryImageUploader() {
  const [targets, setTargets] = useState<{
    featured: HTMLLabelElement | null;
    item: HTMLLabelElement | null;
    exclusion: HTMLElement | null;
    exclusionSource: HTMLInputElement | null;
  }>({ featured: null, item: null, exclusion: null, exclusionSource: null });

  useEffect(() => {
    let hiddenUpload: HTMLLabelElement | null = null;
    let hiddenBuilder: HTMLLabelElement | null = null;
    const refreshTargets = () => {
      const found = findImageLabels();
      if (hiddenUpload && hiddenUpload !== found.oldUpload) hiddenUpload.hidden = false;
      hiddenUpload = found.oldUpload;
      if (hiddenUpload) hiddenUpload.hidden = true;
      if (hiddenBuilder && hiddenBuilder !== found.showInBuilder) hiddenBuilder.hidden = false;
      hiddenBuilder = found.showInBuilder;
      if (hiddenBuilder) hiddenBuilder.hidden = true;
      setTargets((current) =>
        current.featured === found.featured && current.item === found.item && current.exclusion === found.checkboxHost && current.exclusionSource === found.builderInput
          ? current
          : { featured: found.featured, item: found.item, exclusion: found.checkboxHost, exclusionSource: found.builderInput }
      );
    };
    refreshTargets();
    const observer = new MutationObserver(refreshTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (hiddenUpload) hiddenUpload.hidden = false;
      if (hiddenBuilder) hiddenBuilder.hidden = false;
    };
  }, []);

  return <>{targets.featured && <InlineUploader target={targets.featured} />}{targets.item && <InlineUploader target={targets.item} />}{targets.exclusion && targets.exclusionSource && <ExclusionCheckbox target={targets.exclusion} source={targets.exclusionSource} />}</>;
}
