import type { ProjectsRepository } from "./repository";
import { createJsonRepository } from "./store-json";
import {
  createSupabaseRepository,
  hasSupabaseProjectsStore,
} from "./store-supabase";

let instance: ProjectsRepository | null = null;

export function getRepository(): ProjectsRepository {
  if (instance) return instance;
  instance = hasSupabaseProjectsStore()
    ? createSupabaseRepository()
    : createJsonRepository();
  return instance;
}

export function setRepository(repo: ProjectsRepository): void {
  instance = repo;
}
