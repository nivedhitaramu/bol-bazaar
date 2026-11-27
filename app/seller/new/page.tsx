"use client";
import { AppHeader } from "@/components/AppHeader";
import { SellerGate } from "@/components/SellerGate";
import { NewListing } from "./NewListing";

export default function NewProductPage() {
  return (
    <>
      <AppHeader />
      <main>
        <SellerGate>{(seller, setSeller) => <NewListing seller={seller} setSeller={setSeller} />}</SellerGate>
      </main>
    </>
  );
}
