import { Project } from "@/types/project";

const STORAGE_KEY = "bp-projects";
const COUNTER_KEY = "bp-next-project-number";

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
        id: crypto.randomUUID(),
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