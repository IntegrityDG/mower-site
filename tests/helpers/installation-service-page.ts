import EquipmentReturnPolicyModal from "../../components/policies/EquipmentReturnPolicyModal";
import * as runtime from "react/jsx-runtime";
import Link from "next/link";
import Image from "next/image";
import DemoRequestForm from "../../components/services-scheduling/DemoRequestForm";
import * as config from "../../lib/scheduling/config";
import * as types from "../../lib/demo-scheduling/types";
import * as disclaimer from "../../lib/demo-party/disclaimer";
import * as stripeConfig from "../../lib/stripe/config-values";
import { loadInstallationModule as load } from "./installation-module";

// Render the actual page and components. Only the Next server-only marker and
// server environment are replaced; no database or third-party call is made.
export function servicesSchedulingPage(intakeEnabled: boolean) {
  const controls = load<typeof import("../../lib/installations/controls")>("lib/installations/controls.ts", {
    "@/lib/stripe/config-values": stripeConfig,
  }, { INSTALLATION_INTAKE_ENABLED: String(intakeEnabled) });
  return load<typeof import("../../app/services-scheduling/page")>("app/services-scheduling/page.tsx", {
    "@/components/policies/EquipmentReturnPolicyModal": EquipmentReturnPolicyModal, "react/jsx-runtime": runtime, "next/link": Link, "next/image": Image,
    "@/components/services-scheduling/DemoRequestForm": DemoRequestForm,
    "@/lib/demo-party/disclaimer": disclaimer, "@/lib/demo-scheduling/types": types,
    "@/lib/scheduling/config": config, "@/lib/installations/controls": controls,
  }).default;
}
