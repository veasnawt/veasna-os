import { WorkflowModule } from "@/types/workflow";
import {
  Idea,
  Create,
  Publish,
  Document,
} from "@veasnawt/vicons";

export const workflowModules: WorkflowModule[] = [
  {
    id: "idea",
    title: "Idea",
    description: "Capture, refine, and organize your core idea.",
    icon: Idea,
    route: "idea",
  },
  {
    id: "script",
    title: "Script",
    description: "Research, structure, and write your narration.",
    icon: Document,
    route: "script",
  },
  {
    id: "create",
    title: "Create",
    description: "Build your video with assets, voice, music, and editing.",
    icon: Create,
    route: "create",
  },
  {
    id: "publish",
    title: "Publish",
    description: "Export and publish your project everywhere.",
    icon: Publish,
    route: "publish",
  },
];