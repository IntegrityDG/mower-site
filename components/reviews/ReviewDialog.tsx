"use client";
import { useEffect, useRef } from "react";
import ReviewForm from "./ReviewForm";
export default function ReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
  return <dialog ref={ref} onClose={onClose} onClick={e=>{if(e.target===ref.current)onClose();}} className="m-auto max-h-[92vh] w-[min(920px,94vw)] overflow-y-auto rounded-[2rem] bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/70"><div className="sticky top-0 z-10 flex justify-end border-b border-slate-200 bg-white px-5 py-3"><button onClick={onClose} className="rounded-xl px-4 py-2 font-black hover:bg-slate-100" aria-label="Close review form">Close ×</button></div><div className="p-6 sm:p-9"><ReviewForm /></div></dialog>;
}
