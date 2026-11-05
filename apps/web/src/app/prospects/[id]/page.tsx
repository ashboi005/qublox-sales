"use client";
import { use } from "react";
import { Workspace } from "@/components/workspace";
import { ProspectReview } from "@/components/prospect-review";
export default function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Workspace>
      <ProspectReview id={id} />
    </Workspace>
  );
}
