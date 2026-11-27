"use client";
import { AppHeader } from "@/components/AppHeader";
import { SellerGate } from "@/components/SellerGate";
import { ShopSetup } from "./ShopSetup";

export default function ShopSetupPage() {
  return (
    <>
      <AppHeader />
      <main>
        <SellerGate>{(seller, setSeller) => <ShopSetup seller={seller} setSeller={setSeller} />}</SellerGate>
      </main>
    </>
  );
}
