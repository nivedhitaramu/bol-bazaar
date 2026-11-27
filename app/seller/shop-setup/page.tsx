"use client";
import { AppHeader } from "@/components/AppHeader";
import { SellerGate } from "@/components/SellerGate";
import { ShopSetup } from "./ShopSetup";

export default function ShopSetupPage() {
  return (
    <>
      <AppHeader />
      <main>
        <SellerGate>{(seller) => <ShopSetup seller={seller} />}</SellerGate>
      </main>
    </>
  );
}
