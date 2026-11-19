import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a project's agent works (FDR-012): an empty folder of its own, derived from the project's
 * ID, and no Git repository. Made when its agent first starts, removed with the project.
 */
export function projectPath(projectsDir: string, projectId: string): string {
	// it names a folder that is removed with everything in it: nothing but an ID may
	if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error(`Not a project: ${projectId}`);
	return join(projectsDir, projectId);
}

export function ensureProject(projectsDir: string, projectId: string): string {
	const path = projectPath(projectsDir, projectId);
	mkdirSync(path, { recursive: true });
	return path;
}

export function removeProject(projectsDir: string, projectId: string) {
	rmSync(projectPath(projectsDir, projectId), { recursive: true, force: true });
}
