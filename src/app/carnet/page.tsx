import type { Metadata } from "next";
import { RoadbookClient } from "@/components/roadbook/RoadbookClient";

export const metadata: Metadata = {
  title: "Carnet de route",
};

export default function CarnetPage() {
  return (
    <div className="max-w-4xl mx-auto w-full p-4 sm:p-6">
      <RoadbookClient />
    </div>
  );
}
