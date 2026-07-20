import { WorkflowModule } from "@/types/workflow";

export const workflowModules: WorkflowModule[] = [
  {
    id: "idea",
    title: "Idea",
    description: "Capture, refine, and organize your core idea.",
    icon: "💡",
    completed: false,
    route: "idea",
  },
  {
    id: "script",
    title: "Script",
    description: "Research, structure, and write your narration.",
    icon: "📝",
    completed: false,
    route: "script",
  },
  {
    id: "create",
    title: "Create",
    description: "Build your video with assets, voice, music, and editing.",
    icon: "🎬",
    completed: false,
    route: "create",
  },
  {
    id: "publish",
    title: "Publish",
    description: "Export and publish your project everywhere.",
    icon: "🚀",
    completed: false,
    route: "publish",
  },
];