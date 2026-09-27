"use client";
import { HOSTED } from "@veasnawt/vcut/src/api/client";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { TemplateViewer as SharedTemplateViewer } from "@veasnawt/vcut/src/ui/TemplateViewer";
export function TemplateViewer(props: Omit<ComponentProps<typeof SharedTemplateViewer>, "onUseTemplate">) {
  const router = useRouter();
  return <SharedTemplateViewer {...props} onOpenCreator={HOSTED ? (id) => router.push(`/u/${encodeURIComponent(id)}`) : undefined} onUseTemplate={(template) => router.push(`/edit?templateId=${encodeURIComponent(template.id)}&projectName=${encodeURIComponent(template.name)}`)} />;
}