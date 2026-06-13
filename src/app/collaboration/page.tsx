import type { Metadata } from "next";
import { ActivityVote } from "@/components/collab/ActivityVote";

export const metadata: Metadata = {
  title: "Vote des activités",
};

export default function CollaborationPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Vote des activités
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Faites participer la famille : chacun approuve ses activités préférées.
        </p>
      </header>

      <ActivityVote />
    </div>
  );
}
