"use client";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { TemplateViewer as SharedTemplateViewer } from "@veasnawt/vcut/src/ui/TemplateViewer";
export function TemplateViewer(props: Omit<ComponentProps<typeof SharedTemplateViewer>, "onUseTemplate">) {
  const router = useRouter();
  return <SharedTemplateViewer {...props} onUseTemplate={(template) => router.push(`/edit?templateId=${encodeURIComponent(template.id)}&projectName=${encodeURIComponent(template.name)}`)} />;
}