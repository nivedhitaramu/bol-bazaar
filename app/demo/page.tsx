import type { Metadata } from "next";
import { DemoSplit } from "./DemoSplit";

export const metadata: Metadata = { title: "Live demo — Bol Bazaar" };

export default function DemoPage() {
  return <DemoSplit />;
}
