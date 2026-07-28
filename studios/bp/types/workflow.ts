import type { ComponentType } from "react";
import type { IconProps } from "@veasnawt/vicons";

export interface WorkflowModule {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
  route: string;
}