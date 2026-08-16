import { Project } from "@/types/project";

const STORAGE_KEY = "bp-projects";
const COUNTER_KEY = "bp-next-project-number";

/** `crypto.randomUUID` is gated to secure contexts (HTTPS, or literally `localhost`) — a plain LAN
 *  IP over HTTP (e.g. opening BP Studio on an iPad at `http://192.168.x.x:3001`) does NOT count, so
 *  `crypto.randomUUID` is simply undefined there, throwing the instant a new project is created.
 *  `crypto.getRandomValues`, unlike `randomUUID`, is NOT restricted to secure contexts. */
function randomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

const defaultProjects: Project[] = [];

export function loadProjects(): Project[] {
    if (typeof window === "undefined") {
        return defaultProjects;
    }

    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
        return [];
    }

    return JSON.parse(stored).map((project: any) => ({
        ...project,
        idea: project.idea ?? {
            content: "",
        },
    }));
}

export function saveProjects(projects: Project[]) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(projects)
    );
}

export function createProject(): Project {
    const projects = loadProjects();

    const number = getNextProjectNumber();

    const project: Project = {
        id: randomId(),
        code: `BP${number.toString().padStart(3, "0")}`,
        title: "Untitled Project",

        idea: {
            content: "",
        },
    };

    projects.unshift(project);

    saveProjects(projects);

    setNextProjectNumber(number + 1);

    return project;
}


function getNextProjectNumber(): number {
    const stored = localStorage.getItem(COUNTER_KEY);

    if (!stored) {
        return 1;
    }

    return Number(stored);
}

function setNextProjectNumber(number: number) {
    localStorage.setItem(
        COUNTER_KEY,
        number.toString()
    );
}

export function getProjectById(
    id: string
): Project | undefined {
    return loadProjects().find(
        (project) => project.id === id
    );
}

export function updateProject(updatedProject: Project) {
    const projects = loadProjects().map((project) =>
        project.id === updatedProject.id
            ? updatedProject
            : project
    );

    saveProjects(projects);
}

export function deleteProject(id: string) {
    const projects = loadProjects().filter(
        (project) => project.id !== id
    );

    saveProjects(projects);
}