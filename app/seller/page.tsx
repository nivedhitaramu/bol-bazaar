"use client";
import { AppHeader } from "@/components/AppHeader";
import { SellerGate } from "@/components/SellerGate";
import { Dashboard } from "./Dashboard";

export default function SellerPage() {
  return (
    <>
      <AppHeader />
      <main>
        <SellerGate>{(seller, setSeller) => <Dashboard seller={seller} setSeller={setSeller} onSignOut={() => setSeller(null)} />}</SellerGate>
      </main>
    </>
  );
}
