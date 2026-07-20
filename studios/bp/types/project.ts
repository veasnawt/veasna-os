import { Idea } from "./idea";

export interface Project {
  id: string;
  code: string;
  title: string;

  idea: Idea;
}