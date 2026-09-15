import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as memberFeatures from "../../lib/dealer-network/member-features";
import * as locationPresentation from "../../lib/dealer-network/member-location-presentation";
import * as types from "../../lib/dealer-network/types";

type Panel = "DirectoryPanel" | "DirectoryCard" | "AccountSecurityPanel";

/** Render the actual private portal panels without production exports or live member data. */
export function loadDealerPortal(fetcher: typeof fetch = fetch, geolocationEnabled = memberFeatures.DEALER_NETWORK_GEOLOCATION_UI_ENABLED) {
  let stateValues: unknown[] = [], stateIndex = 0;
  const stateWrites: unknown[] = [];
  const source = readFileSync(new URL("../../components/dealer-network/MemberPortal.tsx", import.meta.url), "utf8") +
    "\nexport { DirectoryPanel, DirectoryCard, AccountSecurityPanel };";
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  const dependencies: Record<string, unknown> = {
    react: { ...React, useState: (initial: unknown) => [stateIndex < stateValues.length ? stateValues[stateIndex++] : initial,
      (value: unknown) => stateWrites.push(value)], useEffect: () => {}, useCallback: (callback: unknown) => callback },
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "next/image": (props: Record<string, unknown>) => React.createElement("img", { ...props, unoptimized: undefined }),
    "@/lib/dealer-network/member-features": { ...memberFeatures, DEALER_NETWORK_GEOLOCATION_UI_ENABLED: geolocationEnabled },
    "@/lib/dealer-network/member-location-presentation": locationPresentation,
    "@/lib/dealer-network/types": types,
    "@/lib/dealer-network/browser-geolocation": {},
    "@/lib/dealer-network/messaging-validation": {},
    "@/lib/dealer-network/message-upload": {},
    "@/lib/dealer-network/validation": {},
    "./TroubleshootingPanel": {}, "./DealerNetworkBoardPanel": {}, "./DealerNetworkNotificationBell": {},
    "./MemberInvitationPanel": {}, "./useDealerNetworkNotifications": {},
  };
  runInNewContext(code, { exports, fetch: fetcher, URLSearchParams, Date, console,
    FormData: class { constructor(private values: Record<string, string>) {} get(key: string) { return this.values[key] ?? null; } },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected portal dependency: ${name}`);
      return dependencies[name];
    },
  });
  const panels = exports as Record<Panel, (props: Record<string, unknown>) => React.ReactElement>;
  function tree(panel: Panel, props: Record<string, unknown> = {}, states: unknown[] = []) {
    stateValues = states; stateIndex = 0;
    return panels[panel](props);
  }
  return { tree, stateWrites, render: (panel: Panel, props: Record<string, unknown> = {}, states: unknown[] = []) =>
    renderToStaticMarkup(tree(panel, props, states)) };
}
